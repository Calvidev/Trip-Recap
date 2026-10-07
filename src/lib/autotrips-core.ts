import { haversineKm } from "./geo.ts";
import { isApproxCity } from "./places.ts";
import type { Checkin, Mode, Place, Trip } from "./types";

/**
 * Infers trips from check-ins: whenever two consecutive check-ins are in
 * different cities more than `minKm` apart, you travelled between them.
 * Pure (no DB) so it can be unit-tested.
 */

export interface InferredTrip {
  externalId: string;
  mode: Mode;
  origin: Place;
  dest: Place;
  date: string; // day of the first check-in at the destination
  fromDate: string; // last check-in at the origin
  departTime?: string | null;
  arriveTime?: string | null; // set when it must arrive before something else that day
}

export const AUTO_MIN_KM = 50;
export const AUTO_MAX_DRIVE_KM = 1000; // further than this overnight → assume a flight

const known = (c: Checkin) => c.city && c.city !== "Unknown" && c.country && c.country !== "??";
const cityKey = (c: Checkin) => `${c.country.toUpperCase()}|${c.city.trim().toLowerCase()}`;
const toPlace = (c: Checkin): Place => ({ name: c.city, city: c.city, country: c.country.toUpperCase(), lat: c.lat, lon: c.lon, code: null });

export function inferTrips(checkins: Checkin[], realTrips: Pick<Trip, "departDate" | "arriveDate">[], minKm = AUTO_MIN_KM): InferredTrip[] {
  const pts = checkins
    .filter(known)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "99:99").localeCompare(b.time ?? "99:99") || a.id - b.id);

  const out: InferredTrip[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (cityKey(a) === cityKey(b)) continue;
    // "Germany (city unknown)" → Berlin isn't a trip, just a better fix inside the same country.
    if (a.country.toUpperCase() === b.country.toUpperCase() && (isApproxCity(a.city) || isApproxCity(b.city))) continue;
    const km = haversineKm(a.lat, a.lon, b.lat, b.lon);
    if (km < minKm) continue;
    // A trip you logged yourself (or from Gmail) during these days already explains the move.
    const covered = realTrips.some(
      (t) => (t.departDate >= a.date && t.departDate <= b.date) || (t.arriveDate >= a.date && t.arriveDate <= b.date),
    );
    if (covered) continue;
    out.push({
      externalId: `auto:${a.date}:${cityKey(a)}>${b.date}:${cityKey(b)}`.toLowerCase(),
      mode: km > AUTO_MAX_DRIVE_KM ? "flight" : "drive",
      origin: toPlace(a),
      dest: toPlace(b),
      date: b.date,
      fromDate: a.date,
    });
  }
  return out;
}

const NEAR_KM = 80;

/**
 * Fills the ground legs between real trips that don't connect: you landed in
 * Hannover and your next flight left from Düsseldorf, so you went Hannover →
 * Düsseldorf somehow. Dated on the first check-in near the next departure
 * point, else on the day of that departure.
 */
export function inferGapTrips(
  realTrips: Pick<Trip, "id" | "origin" | "dest" | "departDate" | "departTime" | "arriveDate" | "groupId">[],
  checkins: Checkin[],
  minKm = AUTO_MIN_KM,
): (InferredTrip & { groupId: number | null })[] {
  const sorted = [...realTrips].sort((a, b) => a.departDate.localeCompare(b.departDate) || (a.departTime ?? "").localeCompare(b.departTime ?? "") || a.id - b.id);
  const out: (InferredTrip & { groupId: number | null })[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i];
    if (b.departDate < a.arriveDate) continue; // overlapping / out of order
    const km = haversineKm(a.dest.lat, a.dest.lon, b.origin.lat, b.origin.lon);
    if (km < minKm) continue;
    const seen = checkins
      .filter((c) => c.date > a.arriveDate && c.date <= b.departDate && haversineKm(c.lat, c.lon, b.origin.lat, b.origin.lon) <= NEAR_KM)
      .sort((x, y) => x.date.localeCompare(y.date))[0];
    const key = (p: Place) => `${p.country}|${p.city}`.toLowerCase();
    const date = seen?.date ?? b.departDate;
    // Same day as the next flight: you must have arrived before it left.
    const arriveTime = date === b.departDate && b.departTime ? minusMinutes(b.departTime, 90) : null;
    out.push({
      departTime: arriveTime ? "00:01" : null,
      arriveTime,
      externalId: `auto:gap:${a.id}>${b.id}:${key(a.dest)}>${key(b.origin)}`,
      mode: km > AUTO_MAX_DRIVE_KM ? "flight" : "drive",
      origin: { ...a.dest },
      dest: { ...b.origin },
      date,
      fromDate: a.arriveDate,
      groupId: a.groupId != null && a.groupId === b.groupId ? a.groupId : null,
    });
  }
  return out;
}

function minusMinutes(hhmm: string, m: number): string {
  const [h, mm] = hhmm.split(":").map(Number);
  const t = Math.max(2, h * 60 + mm - m); // never before 00:02
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
