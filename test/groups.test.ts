import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestGroups } from "../src/lib/groups-core.ts";
import type { Place, Trip } from "../src/lib/types.ts";

const P = (city: string, country: string, lat: number, lon: number): Place => ({ name: city, city, country, lat, lon, code: null });
const SPGG = P("San Pedro Garza García", "MX", 25.6264, -100.3539);
const MTY = P("Monterrey", "MX", 25.6866, -100.3161); // same metro → counts as home
const DE = P("Germany (city unknown)", "DE", 51.6, 9.49);
const TR = P("Türkiye (city unknown)", "TR", 39.07, 34.46);
const GB = P("United Kingdom (city unknown)", "GB", 53.92, -2.36);
const CORPUS = P("Corpus Christi", "US", 27.8, -97.4);
const CDMX = P("Mexico City", "MX", 19.43, -99.13);
let id = 0;
const T = (o: Place, d: Place, date: string, groupId: number | null = null): Trip => ({
  id: ++id, mode: "flight", origin: o, dest: d, departDate: date, departTime: null, arriveDate: date, arriveTime: null,
  flightNumber: null, airline: null, notes: null, distanceKm: 0, durationMin: null, source: "auto", groupId,
});
const home = { city: SPGG.city, country: "MX", lat: SPGG.lat, lon: SPGG.lon };

test("each journey away from home becomes a group named after the countries", () => {
  const trips = [
    T(SPGG, DE, "2026-03-21"), T(DE, TR, "2026-03-26"), T(TR, GB, "2026-03-28"), T(GB, MTY, "2026-04-04"),
    T(MTY, CORPUS, "2026-07-03"), T(CORPUS, SPGG, "2026-07-06"),
    T(SPGG, CDMX, "2026-08-01"), T(CDMX, SPGG, "2026-08-03"),
  ];
  assert.deepEqual(suggestGroups(trips, home, "2026-10-07").map((g) => [g.name, g.tripIds.length]), [
    ["Germany, Türkiye & United Kingdom · Mar 2026", 4],
    ["United States · Jul 2026", 2],
    ["Mexico City · Aug 2026", 2],
  ]);
});

test("trips you already grouped are left alone; future trips are ignored", () => {
  const trips = [T(SPGG, DE, "2026-03-21", 7), T(DE, SPGG, "2026-03-30", 7), T(SPGG, CORPUS, "2026-12-01"), T(CORPUS, SPGG, "2026-12-03")];
  assert.deepEqual(suggestGroups(trips, home, "2026-10-07"), []);
});

test("an ongoing journey (not back yet) is still grouped", () => {
  const trips = [T(SPGG, DE, "2026-09-01"), T(DE, TR, "2026-09-05")];
  assert.equal(suggestGroups(trips, home, "2026-10-07")[0].tripIds.length, 2);
});
