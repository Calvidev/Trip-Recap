import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDayLog, totals, rollingDays } from "../src/lib/stays.ts";
import type { Trip, Checkin, Place } from "../src/lib/types.ts";

const P = (city: string, country: string): Place => ({ name: city, city, country, lat: 0, lon: 0 });
let id = 0;
const trip = (o: Place, d: Place, dd: string, dt: string | null, ad: string, at: string | null, mode: Trip["mode"] = "flight"): Trip => ({
  id: ++id, mode, origin: o, dest: d, departDate: dd, departTime: dt, arriveDate: ad, arriveTime: at,
  flightNumber: null, airline: null, notes: null, distanceKm: 0, durationMin: null, source: "manual",
});

const MEX = P("Mexico City", "MX"), MAD = P("Madrid", "ES"), PAR = P("Paris", "FR");

test("counts nights and days across a round trip", () => {
  const trips = [
    trip(MEX, MAD, "2026-01-01", "20:00", "2026-01-02", "13:00"), // red-eye
    trip(MAD, PAR, "2026-01-05", null, "2026-01-05", null, "train"),
    trip(PAR, MEX, "2026-01-08", "10:00", "2026-01-08", "15:00"),
  ];
  const log = buildDayLog(trips, [], "2026-01-10");
  const t = totals(log);
  const city = (c: string) => t.cities.find((x) => x.label === c)!;
  // Jan 1 night is in transit.
  assert.equal(log[0].night, null);
  // Madrid nights: Jan 2,3,4 ; Paris: 5,6,7 ; Mexico City: 8,9,10
  assert.equal(city("Madrid").nights, 3);
  assert.equal(city("Paris").nights, 3);
  assert.equal(city("Mexico City").nights, 3);
  // Days: travel days count for both ends.
  assert.equal(city("Madrid").days, 4); // 2,3,4,5
  assert.equal(city("Paris").days, 4); // 5,6,7,8
  assert.equal(city("Mexico City").days, 4); // 1, 8, 9, 10
  assert.equal(t.trackedDays, 10);
  assert.deepEqual(t.stays.map((s) => [s.place.city, s.nights]), [["Mexico City", 3], ["Paris", 3], ["Madrid", 3]]);
});

test("check-ins override trip-inferred location and end transit", () => {
  const trips = [trip(MEX, MAD, "2026-03-01", "08:00", "2026-03-04", "18:00", "drive")];
  const checkins: Checkin[] = [
    { id: 1, date: "2026-03-01", time: "23:00", lat: 0, lon: 0, city: "Lyon", country: "FR", source: "shortcut" },
  ];
  const log = buildDayLog(trips, checkins, "2026-03-04");
  assert.equal(log[0].night?.city, "Lyon");
  assert.equal(log[1].night?.city, "Lyon"); // nothing new on day 2 → still Lyon
  assert.equal(log[3].night?.city, "Madrid");
});

test("year range filter and rolling window", () => {
  const trips = [trip(MEX, PAR, "2025-12-30", "10:00", "2025-12-30", "20:00"), trip(PAR, MEX, "2026-01-03", "10:00", "2026-01-03", "20:00")];
  const log = buildDayLog(trips, [], "2026-01-05");
  const y26 = totals(log, "2026-01-01", "2026-12-31");
  assert.equal(y26.countries.find((c) => c.key === "FR")!.days, 3); // Jan 1,2,3
  assert.equal(rollingDays(log, ["FR", "ES"], "2026-01-05", 180), 5);
});
