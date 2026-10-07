import "server-only";
import { refreshDerived } from "./refresh";
import { db } from "./db";
import { airport } from "./airports";
import { airlineInfo } from "./airlines";
import { parseFlightyCsv } from "./flighty";
import { createTrip, findSameFlight, updateTrip, type TripPayload } from "./trips";
import { replaceGuessesWithRealFlights } from "./autotrips";

import type { Place } from "./types";

export interface FlightyResult {
  added: number;
  updated: number;
  canceled: number;
  unknownAirports: string[];
  replaced: number; // guessed (auto) trips superseded by real flights
  autoTrips: { added: number; removed: number };
}

const toPlace = (code: string): Place | null => {
  const a = airport(code);
  return a ? { name: a.name, city: a.city, country: a.country, lat: a.lat, lon: a.lon, code: a.code } : null;
};

/**
 * Imports a Flighty CSV export. Re-importing updates flights in place (matched by
 * Flighty's flight id). Guessed trips covering the same move (auto-detected from
 * check-ins, including ones you edited) are replaced by the real flight, which
 * takes over their group.
 */
export function importFlighty(text: string): FlightyResult {
  const res: FlightyResult = { added: 0, updated: 0, canceled: 0, unknownAirports: [], replaced: 0, autoTrips: { added: 0, removed: 0 } };
  const findByExt = db().prepare("SELECT id FROM trips WHERE external_id = ?");

  for (const f of parseFlightyCsv(text)) {
    if (f.canceled) {
      res.canceled++;
      continue;
    }
    const arrivedAt = f.divertedTo || f.to; // a diverted flight ended where it actually landed
    const origin = toPlace(f.from);
    const dest = toPlace(arrivedAt);
    if (!origin || !dest) {
      for (const c of [f.from, arrivedAt]) if (!airport(c) && !res.unknownAirports.includes(c)) res.unknownAirports.push(c);
      continue;
    }
    const al = airlineInfo(f.airline);
    const details = [
      f.aircraft,
      f.seat && `Seat ${f.seat}${f.seatType ? ` (${f.seatType.toLowerCase()})` : ""}`,
      f.cabin,
      f.divertedTo && `Diverted to ${f.divertedTo} (planned ${f.to})`,
      f.reason,
      f.notes,
    ].filter(Boolean);
    const payload: TripPayload = {
      mode: "flight",
      origin,
      dest,
      departDate: f.departure?.slice(0, 10) ?? f.date,
      departTime: f.departure?.slice(11, 16) ?? null,
      arriveDate: f.arrival?.slice(0, 10) ?? null,
      arriveTime: f.arrival?.slice(11, 16) ?? null,
      flightNumber: `${al.iata}${f.number}`,
      airline: al.name,
      notes: details.join(" · ") || null,
      source: "flighty",
      externalId: `flighty:${f.flightyId}`,
    };
    // Same Flighty flight imported before, or the same flight already added from an email.
    const existing = (findByExt.get(payload.externalId) as { id: number } | undefined) ?? findSameFlight(payload);
    if (existing) {
      updateTrip(existing.id, payload);
      res.updated++;
    } else if (createTrip(payload)) res.added++;
  }

  res.replaced = replaceGuessesWithRealFlights();
  res.autoTrips = refreshDerived().autoTrips;
  return res;
}

