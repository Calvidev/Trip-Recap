import "server-only";
import { z } from "zod";
import { db, rowToCheckin, rowToTrip } from "./db";
import { airport } from "./airports";
import { estimateFlightMinutes, haversineKm, minutesBetween } from "./geo";
import { MODES, type Checkin, type Trip } from "./types";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const time = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM").nullable().optional();
const PlaceSchema = z.object({
  name: z.string().min(1),
  city: z.string().min(1),
  country: z.string().length(2),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  code: z.string().nullable().optional(),
});

export const TripSchema = z.object({
  mode: z.enum(MODES),
  origin: PlaceSchema,
  dest: PlaceSchema,
  departDate: date,
  departTime: time,
  arriveDate: date.nullable().optional(),
  arriveTime: time,
  flightNumber: z.string().nullable().optional(),
  airline: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  distanceKm: z.number().positive().nullable().optional(),
  durationMin: z.number().int().positive().nullable().optional(),
  source: z.string().optional(),
  externalId: z.string().nullable().optional(),
});
export type TripPayload = z.infer<typeof TripSchema>;

function normalize(t: TripPayload) {
  const arriveDate = t.arriveDate || t.departDate;
  // If an airport code is present, its time zone makes duration exact.
  const tzA = t.origin.code ? airport(t.origin.code)?.tz : undefined;
  const tzB = t.dest.code ? airport(t.dest.code)?.tz : undefined;
  const km = t.distanceKm ?? Math.round(haversineKm(t.origin.lat, t.origin.lon, t.dest.lat, t.dest.lon));
  let duration = t.durationMin ?? null;
  if (duration == null && t.departTime && t.arriveTime) {
    duration = minutesBetween(t.departDate, t.departTime, arriveDate, t.arriveTime, tzA, tzB);
  }
  if (duration == null && t.mode === "flight") duration = estimateFlightMinutes(km);
  return {
    mode: t.mode,
    origin_name: t.origin.name, origin_city: t.origin.city, origin_country: t.origin.country.toUpperCase(),
    origin_lat: t.origin.lat, origin_lon: t.origin.lon, origin_code: t.origin.code?.toUpperCase() || null,
    dest_name: t.dest.name, dest_city: t.dest.city, dest_country: t.dest.country.toUpperCase(),
    dest_lat: t.dest.lat, dest_lon: t.dest.lon, dest_code: t.dest.code?.toUpperCase() || null,
    depart_date: t.departDate, depart_time: t.departTime || null,
    arrive_date: arriveDate, arrive_time: t.arriveTime || null,
    flight_number: t.flightNumber?.replace(/\s+/g, "").toUpperCase() || null,
    airline: t.airline || null,
    notes: t.notes || null,
    distance_km: km,
    duration_min: duration,
    source: t.source || "manual",
    external_id: t.externalId || null,
  };
}

export function listTrips(): Trip[] {
  return db().prepare("SELECT * FROM trips ORDER BY depart_date DESC, depart_time DESC").all().map((r) => rowToTrip(r as Record<string, unknown>));
}

/** Inserts a trip. Returns null if a trip with the same externalId already exists. */
export function createTrip(t: TripPayload): Trip | null {
  const row = normalize(t);
  const cols = Object.keys(row);
  const res = db()
    .prepare(`INSERT OR IGNORE INTO trips (${cols.join(",")}) VALUES (${cols.map((c) => "@" + c).join(",")})`)
    .run(row);
  if (!res.changes) return null;
  return getTrip(Number(res.lastInsertRowid));
}

export function getTrip(id: number): Trip | null {
  const r = db().prepare("SELECT * FROM trips WHERE id = ?").get(id);
  return r ? rowToTrip(r as Record<string, unknown>) : null;
}

export function updateTrip(id: number, t: TripPayload): Trip | null {
  const row = normalize(t);
  const { source: _s, external_id: _e, ...editable } = row;
  void _s; void _e;
  const sets = Object.keys(editable).map((c) => `${c} = @${c}`).join(", ");
  db().prepare(`UPDATE trips SET ${sets} WHERE id = @id`).run({ ...editable, id });
  // Once you edit an auto-detected trip it's yours: re-syncing won't touch it.
  db().prepare("UPDATE trips SET source = 'auto-edited' WHERE id = ? AND source = 'auto'").run(id);
  return getTrip(id);
}

/** Deletes a trip and returns its external id (if any). */
export function deleteTrip(id: number): string | null {
  const r = db().prepare("SELECT external_id FROM trips WHERE id = ?").get(id) as { external_id: string | null } | undefined;
  db().prepare("DELETE FROM trips WHERE id = ?").run(id);
  return r?.external_id ?? null;
}

export function listCheckins(): Checkin[] {
  return db().prepare("SELECT * FROM checkins ORDER BY date DESC, time DESC").all().map((r) => rowToCheckin(r as Record<string, unknown>));
}

export function addCheckin(c: Omit<Checkin, "id">): Checkin {
  const res = db()
    .prepare("INSERT INTO checkins (date, time, lat, lon, city, country, source) VALUES (@date, @time, @lat, @lon, @city, @country, @source)")
    .run(c);
  return { ...c, id: Number(res.lastInsertRowid) };
}

export function deleteCheckin(id: number) {
  db().prepare("DELETE FROM checkins WHERE id = ?").run(id);
}

/** Bulk insert, skipping rows that duplicate an existing check-in (same date and place). */
export function importCheckins(rows: Omit<Checkin, "id">[]): { added: number; duplicates: number } {
  const exists = db().prepare("SELECT 1 FROM checkins WHERE date = ? AND abs(lat - ?) < 0.001 AND abs(lon - ?) < 0.001");
  const insert = db().prepare(
    "INSERT INTO checkins (date, time, lat, lon, city, country, source) VALUES (@date, @time, @lat, @lon, @city, @country, @source)",
  );
  let added = 0;
  db().transaction(() => {
    for (const r of rows) {
      if (exists.get(r.date, r.lat, r.lon)) continue;
      insert.run(r);
      added++;
    }
  })();
  return { added, duplicates: rows.length - added };
}

const UNKNOWN_WHERE = "city IN ('Unknown', '') OR country IN ('??', '')";

export function countUnknownCheckins(): number {
  return (db().prepare(`SELECT count(*) AS n FROM checkins WHERE ${UNKNOWN_WHERE}`).get() as { n: number }).n;
}

/**
 * Re-geocodes check-ins whose city/country is unknown (e.g. imported rows where
 * the original lookup failed). Nearby points share one lookup (~100 m grid), and
 * at most `limit` lookups run per call to respect Nominatim's 1 req/s policy.
 */
export async function repairUnknownCheckins(
  reverse: (lat: number, lon: number) => Promise<{ city: string; country: string }>,
  limit = 90,
): Promise<{ fixed: number; remaining: number }> {
  const rows = db().prepare(`SELECT id, lat, lon FROM checkins WHERE ${UNKNOWN_WHERE}`).all() as { id: number; lat: number; lon: number }[];
  const update = db().prepare("UPDATE checkins SET city = ?, country = ? WHERE id = ?");
  const cache = new Map<string, { city: string; country: string }>();
  let lookups = 0;
  let fixed = 0;
  for (const r of rows) {
    const key = `${r.lat.toFixed(3)},${r.lon.toFixed(3)}`;
    let place = cache.get(key);
    if (!place) {
      if (lookups >= limit) continue;
      lookups++;
      place = await reverse(r.lat, r.lon);
      cache.set(key, place);
    }
    if (place.city !== "Unknown" && place.country !== "??") {
      update.run(place.city, place.country, r.id);
      fixed++;
    }
  }
  return { fixed, remaining: countUnknownCheckins() };
}
