import { test } from "node:test";
import assert from "node:assert/strict";
import { isFlightyCsv, parseFlightyCsv } from "../src/lib/flighty.ts";
import { inferGapTrips } from "../src/lib/autotrips-core.ts";
import { buildDayLog, totals } from "../src/lib/stays.ts";
import type { Checkin, Place, Trip } from "../src/lib/types.ts";

const HEADER = "Date,Airline,Flight,From,To,Dep Terminal,Dep Gate,Arr Terminal,Arr Gate,Canceled,Diverted To,Gate Departure (Scheduled),Gate Departure (Actual),Take off (Scheduled),Take off (Actual),Landing (Scheduled),Landing (Actual),Gate Arrival (Scheduled),Gate Arrival (Actual),Aircraft Type Name,Tail Number,PNR,Seat,Seat Type,Cabin Class,Flight Reason,Notes,Flight Flighty ID,Airline Flighty ID,Departure Airport Flighty ID,Arrival Airport Flighty ID,Diverted To Airport Flighty ID,Aircraft Type Flighty ID";
const CSV = [
  HEADER,
  "2025-11-09,UAL,6001,SFO,MTY,3,F8,3,7,false,PHX,2025-11-09T10:35,2025-11-09T10:43,,,,,2025-11-09T16:20,2025-11-09T13:50,Embraer 175,,X,,,,,,id-div,a,b,c,d,e",
  "2026-02-23,VIV,4087,TIJ,MTY,T1,14,A,,false,,2026-02-23T19:55,2026-02-23T19:46,,,,,2026-02-24T00:40,2026-02-24T00:36,Airbus A320,,X,,,,,,id-tij,a,b,c,,e",
  "2026-04-24,PGT,2219,ADB,SAW,D,241,MAIN,,false,,2026-04-24T21:35,2026-04-24T21:29,,,,,2026-04-24T22:45,,Airbus A321neo,,,31D,AISLE,,,,id-pgt,a,b,c,,e",
  "",
].join("\n");

test("parses a Flighty export: actual times first, diversions, overnight arrivals", () => {
  assert.ok(isFlightyCsv(CSV));
  const [div, tij, pgt] = parseFlightyCsv(CSV);
  assert.deepEqual([div.from, div.to, div.divertedTo, div.departure, div.arrival], ["SFO", "MTY", "PHX", "2025-11-09T10:43", "2025-11-09T13:50"]);
  assert.equal(tij.arrival, "2026-02-24T00:36"); // next day
  assert.equal(pgt.arrival, "2026-04-24T22:45"); // no actual → scheduled
  assert.deepEqual([pgt.seat, pgt.seatType, pgt.flightyId], ["31D", "AISLE", "id-pgt"]);
});

const P = (city: string, country: string, lat: number, lon: number, code: string | null = null): Place => ({ name: city, city, country, lat, lon, code });
const HAJ = P("Hannover", "DE", 52.46, 9.68, "HAJ"), DUS = P("Dusseldorf", "DE", 51.29, 6.77, "DUS");
const LHR = P("London", "GB", 51.47, -0.45, "LHR"), ADB = P("Izmir", "TR", 38.29, 27.16, "ADB");
let id = 0;
const F = (o: Place, d: Place, dd: string, dt: string, ad: string, at: string, groupId: number | null = null): Trip => ({
  id: ++id, mode: "flight", origin: o, dest: d, departDate: dd, departTime: dt, arriveDate: ad, arriveTime: at,
  flightNumber: null, airline: null, notes: null, distanceKm: 0, durationMin: null, source: "flighty", groupId,
});

test("a missing ground leg between flights is filled (Hannover → Düsseldorf)", () => {
  const trips = [F(LHR, HAJ, "2026-04-04", "18:00", "2026-04-04", "20:35", 3), F(DUS, ADB, "2026-04-05", "15:05", "2026-04-05", "19:20", 3)];
  const [gap, ...rest] = inferGapTrips(trips, []);
  assert.equal(rest.length, 0);
  assert.deepEqual([gap.origin.city, gap.dest.city, gap.mode, gap.date, gap.groupId], ["Hannover", "Dusseldorf", "drive", "2026-04-05", 3]);
  assert.equal(gap.arriveTime, "13:35"); // before the 15:05 flight, so that night counts for Izmir
});

test("flights beat a country-only check-in that contradicts them", () => {
  const trips = [F(LHR, HAJ, "2026-03-21", "09:10", "2026-03-21", "11:39"), F(HAJ, LHR, "2026-04-02", "21:40", "2026-04-02", "22:10")];
  const approx = (date: string, city: string, country: string): Checkin => ({ id: ++id, date, time: "06:00", lat: 0.1, lon: 0.1, city, country, source: "import" });
  const checkins = [approx("2026-03-31", "Germany (city unknown)", "DE"), approx("2026-04-01", "United Kingdom (city unknown)", "GB"), approx("2026-04-03", "United Kingdom (city unknown)", "GB")];
  const t = totals(buildDayLog(trips, checkins, "2026-04-03"), "2026-03-31");
  const nights = Object.fromEntries(t.countries.map((c) => [c.key, c.nights]));
  // Apr 1 was still Germany per the flight; the UK starts the night of Apr 2.
  assert.deepEqual(nights, { DE: 2, GB: 2 });
});
