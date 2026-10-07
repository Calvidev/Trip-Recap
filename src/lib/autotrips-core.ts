import { haversineKm } from "./geo.ts";
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
