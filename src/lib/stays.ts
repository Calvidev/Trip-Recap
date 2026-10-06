import type { Checkin, Trip } from "./types";

/**
 * Works out where you were on every calendar day, from trips and nightly
 * check-ins, so we can count days/nights per city and country.
 *
 * Rules:
 *  - Your location only changes through events: a trip departure (you're at
 *    the origin), a trip arrival (you're at the destination) or a check-in
 *    (you're wherever the phone was).
 *  - "Night" = where you were at the end of the day. A trip still underway at
 *    midnight (red-eye, multi-day drive) means the night was spent in transit
 *    and isn't credited to any place, unless a check-in says otherwise.
 *  - "Day" = any place you were in at some point that day: where you woke up,
 *    every departure/arrival/check-in place, and where you slept. A travel day
 *    therefore counts for both ends, which is how most residency/visa rules
 *    (e.g. Schengen 90/180) count days.
 */

export interface PlaceRef {
  key: string; // "FR|Paris"
  city: string;
  country: string;
  lat: number;
  lon: number;
}

export interface DayEntry {
  date: string;
  night: PlaceRef | null; // null = in transit / unknown
  touched: PlaceRef[];
}

export interface PlaceTotal {
  key: string;
  label: string;
  country: string;
  lat: number;
  lon: number;
  nights: number;
  days: number;
  first: string;
  last: string;
}

export interface Stay {
  place: PlaceRef;
  from: string; // first night
  to: string; // last night
  nights: number;
}

interface Event {
  t: string; // sortable local timestamp "YYYY-MM-DDTHH:MM"
  date: string;
  place: PlaceRef;
  kind: "depart" | "arrive" | "checkin";
  tripId?: number;
}

export function placeRef(city: string, country: string, lat: number, lon: number): PlaceRef {
  const c = (city || "Unknown").trim();
  const cc = (country || "??").toUpperCase();
  return { key: `${cc}|${c.toLowerCase()}`, city: c, country: cc, lat, lon };
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function buildDayLog(trips: Trip[], checkins: Checkin[], until: string): DayEntry[] {
  const events: Event[] = [];
  for (const tr of trips) {
    events.push({
      t: `${tr.departDate}T${tr.departTime ?? "00:01"}`,
      date: tr.departDate,
      place: placeRef(tr.origin.city, tr.origin.country, tr.origin.lat, tr.origin.lon),
      kind: "depart",
      tripId: tr.id,
    });
    events.push({
      t: `${tr.arriveDate}T${tr.arriveTime ?? "23:58"}`,
      date: tr.arriveDate,
      place: placeRef(tr.dest.city, tr.dest.country, tr.dest.lat, tr.dest.lon),
      kind: "arrive",
      tripId: tr.id,
    });
  }
  for (const c of checkins) {
    events.push({
      t: `${c.date}T${c.time ?? "23:59"}`,
      date: c.date,
      place: placeRef(c.city, c.country, c.lat, c.lon),
      kind: "checkin",
    });
  }
  // Stable order; on identical timestamps an arrival precedes a departure.
  const rank = { arrive: 0, checkin: 1, depart: 2 } as const;
  events.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : rank[a.kind] - rank[b.kind]));
  if (!events.length) return [];

  const log: DayEntry[] = [];
  let current: PlaceRef | null = null;
  const inTransit = new Set<number>();
  let i = 0;
  // Future (planned) trips don't count yet: the log stops at `until`.
  for (let day = events[0].date; day <= until; day = addDays(day, 1)) {
    const touched = new Map<string, PlaceRef>();
    if (current && inTransit.size === 0) touched.set(current.key, current);
    while (i < events.length && events[i].date === day) {
      const e = events[i++];
      touched.set(e.place.key, e.place);
      current = e.place;
      if (e.kind === "depart" && e.tripId != null) inTransit.add(e.tripId);
      else if (e.kind === "arrive" && e.tripId != null) inTransit.delete(e.tripId);
      else if (e.kind === "checkin") inTransit.clear();
    }
    const night = inTransit.size === 0 ? current : null;
    if (night) touched.set(night.key, night);
    log.push({ date: day, night, touched: [...touched.values()] });
  }
  return log;
}

export interface Totals {
  cities: PlaceTotal[];
  countries: PlaceTotal[];
  stays: Stay[];
  trackedDays: number;
}

/** Aggregate a day log over [from, to] (inclusive, YYYY-MM-DD). */
export function totals(log: DayEntry[], from = "0000-01-01", to = "9999-12-31"): Totals {
  const cities = new Map<string, PlaceTotal>();
  const countries = new Map<string, PlaceTotal>();
  const stays: Stay[] = [];
  let tracked = 0;

  const bump = (m: Map<string, PlaceTotal>, key: string, label: string, p: PlaceRef, date: string, field: "nights" | "days") => {
    let t = m.get(key);
    if (!t) {
      t = { key, label, country: p.country, lat: p.lat, lon: p.lon, nights: 0, days: 0, first: date, last: date };
      m.set(key, t);
    }
    t[field]++;
    if (date < t.first) t.first = date;
    if (date > t.last) t.last = date;
  };

  for (const d of log) {
    if (d.date < from || d.date > to) continue;
    tracked++;
    const seenCountries = new Set<string>();
    for (const p of d.touched) {
      bump(cities, p.key, p.city, p, d.date, "days");
      if (!seenCountries.has(p.country)) {
        seenCountries.add(p.country);
        bump(countries, p.country, p.country, p, d.date, "days");
      }
    }
    if (d.night) {
      bump(cities, d.night.key, d.night.city, d.night, d.date, "nights");
      bump(countries, d.night.country, d.night.country, d.night, d.date, "nights");
      const last = stays[stays.length - 1];
      if (last && last.place.key === d.night.key && addDays(last.to, 1) === d.date) {
        last.to = d.date;
        last.nights++;
      } else {
        stays.push({ place: d.night, from: d.date, to: d.date, nights: 1 });
      }
    }
  }

  const sort = (a: PlaceTotal, b: PlaceTotal) => b.days - a.days || b.nights - a.nights;
  return {
    cities: [...cities.values()].sort(sort),
    countries: [...countries.values()].sort(sort),
    stays: stays.reverse(),
    trackedDays: tracked,
  };
}

/** Days spent in `country` during the rolling window ending on `date` (e.g. Schengen-style checks). */
export function rollingDays(log: DayEntry[], countries: string[], date: string, windowDays: number): number {
  const start = addDays(date, -(windowDays - 1));
  const set = new Set(countries.map((c) => c.toUpperCase()));
  return log.filter((d) => d.date >= start && d.date <= date && d.touched.some((p) => set.has(p.country))).length;
}
