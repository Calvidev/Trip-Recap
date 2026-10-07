import { test } from "node:test";
import assert from "node:assert/strict";
import { inferTrips } from "../src/lib/autotrips-core.ts";
import type { Checkin } from "../src/lib/types.ts";

let id = 0;
const c = (date: string, city: string, country: string, lat: number, lon: number, time: string | null = null): Checkin =>
  ({ id: ++id, date, time, lat, lon, city, country, source: "shortcut" });

const SPGG = [25.6264, -100.3539] as const;
const SIERRA_ALTA = [25.5804, -100.264] as const; // ~10 km away, different municipality
const CORPUS = [27.8006, -97.3964] as const;
const MADRID = [40.4168, -3.7038] as const;

test("Monterrey area → Corpus Christi is a drive; local moves are ignored", () => {
  const trips = inferTrips([
    c("2026-07-01", "San Pedro Garza García", "MX", ...SPGG),
    c("2026-07-02", "Monterrey", "MX", ...SIERRA_ALTA),
    c("2026-07-03", "Corpus Christi", "US", ...CORPUS),
    c("2026-07-06", "San Pedro Garza García", "MX", ...SPGG),
  ], []);
  assert.deepEqual(trips.map((t) => [t.origin.city, t.dest.city, t.mode, t.date]), [
    ["Monterrey", "Corpus Christi", "drive", "2026-07-03"],
    ["Corpus Christi", "San Pedro Garza García", "drive", "2026-07-06"],
  ]);
});

test("long hops become flights, and logged trips suppress auto ones", () => {
  const cs = [c("2026-08-01", "San Pedro Garza García", "MX", ...SPGG), c("2026-08-02", "Madrid", "ES", ...MADRID)];
  assert.equal(inferTrips(cs, [])[0].mode, "flight");
  assert.equal(inferTrips(cs, [{ departDate: "2026-08-01", arriveDate: "2026-08-02" }]).length, 0);
});

test("unknown places are skipped and ids are stable", () => {
  const cs = [
    c("2026-09-01", "San Pedro Garza García", "MX", ...SPGG),
    c("2026-09-02", "Unknown", "??", ...CORPUS),
    c("2026-09-03", "Corpus Christi", "US", ...CORPUS, "23:00"),
  ];
  const [t] = inferTrips(cs, []);
  assert.equal(t.date, "2026-09-03");
  assert.equal(t.fromDate, "2026-09-01");
  assert.equal(t.externalId, inferTrips([...cs].reverse(), [])[0].externalId);
});
