import "server-only";
import { db } from "./db";
import { airport } from "./airports";
import { airlineInfo } from "./airlines";
import { parseFlightyCsv } from "./flighty";
import { createTrip, deleteTrip, listTrips, updateTrip, type TripPayload } from "./trips";
import { rememberDismissed, syncAutoTrips } from "./autotrips";
import type { Place, Trip } from "./types";

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
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;

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
    const existing = findByExt.get(payload.externalId) as { id: number } | undefined;
    if (existing) {
      updateTrip(existing.id, payload);
      res.updated++;
    } else if (createTrip(payload)) res.added++;
  }

  res.replaced = replaceGuesses();
  res.autoTrips = syncAutoTrips();
  return res;
}

/**
 * A guessed trip (auto or auto-edited) is replaced when real flights explain it:
 * within 3 days of it, a flight leaves its origin country and a flight (possibly
 * a later connection) lands in its destination country — e.g. the guess
 * "San Pedro → Germany" is explained by MTY→DFW, DFW→LHR, LHR→HAJ.
 * Groups survive: real trips inside a group's date span join that group.
 */
function replaceGuesses(): number {
  const trips = listTrips();
  const flights = trips.filter((t) => t.source === "flighty");
  const near = (f: Trip, g: Trip) => dayDiff(f.departDate, g.departDate) <= 3;

  // Date span of every group, taken before any guess is removed.
  const spans = new Map<number, { from: string; to: string }>();
  for (const t of trips) {
    if (t.groupId == null) continue;
    const s = spans.get(t.groupId);
    if (!s) spans.set(t.groupId, { from: t.departDate, to: t.arriveDate });
    else {
      if (t.departDate < s.from) s.from = t.departDate;
      if (t.arriveDate > s.to) s.to = t.arriveDate;
    }
  }

  // Legs that connect two flights (Hannover → Düsseldorf) are not guesses to replace.
  const gapIds = new Set((db().prepare("SELECT id FROM trips WHERE external_id LIKE 'auto:gap:%'").all() as { id: number }[]).map((r) => r.id));
  let n = 0;
  for (const g of trips.filter((t) => (t.source === "auto" || t.source === "auto-edited") && !gapIds.has(t.id))) {
    const leaves = flights.some((f) => near(f, g) && f.origin.country === g.origin.country);
    const lands = flights.some((f) => near(f, g) && f.dest.country === g.dest.country);
    if (!leaves || !lands) continue;
    rememberDismissed(deleteTrip(g.id));
    n++;
  }

  // Ungrouped real trips within a group's span (±1 day) join it.
  const setGroup = db().prepare("UPDATE trips SET group_id = ? WHERE id = ? AND group_id IS NULL");
  for (const [gid, s] of spans) {
    const from = shift(s.from, -1), to = shift(s.to, 1);
    for (const t of listTrips()) if (t.groupId == null && !t.source.startsWith("auto") && t.departDate >= from && t.departDate <= to) setGroup.run(gid, t.id);
  }
  return n;
}

const shift = (d: string, days: number) => new Date(Date.parse(d) + days * 86400000).toISOString().slice(0, 10);
