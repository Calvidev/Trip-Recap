import "server-only";
import { cityAirport, countryCenter } from "./airports";
import { countryName as countryNameOf } from "./geo";
import { APPROX_SUFFIX } from "./places";
import { geocode } from "./geocode";
import type { LocationRow } from "./csv";
import type { Checkin } from "./types";

/**
 * Fills in coordinates for rows that only name a city (e.g. "Berlin, DE" with
 * empty lat/lon) or only a country ("Alemania, DE"). Cities: offline airport
 * list first, then OpenStreetMap. Countries: OpenStreetMap's country centre,
 * else the average of the country's airports; the city becomes
 * "Germany (city unknown)". One lookup per distinct place; unplaceable rows are dropped.
 */
export async function resolveRows(rows: LocationRow[]): Promise<{ rows: Omit<Checkin, "id">[]; unresolved: number }> {
  const cache = new Map<string, { lat: number; lon: number; country: string } | null>();
  const out: Omit<Checkin, "id">[] = [];
  let unresolved = 0;
  for (const r of rows) {
    const { countryName, ...rest } = r;
    if (r.lat != null && r.lon != null) {
      out.push({ ...rest, lat: r.lat, lon: r.lon });
      continue;
    }
    const key = `${r.city}|${r.country}|${countryName}`.toLowerCase();
    if (!cache.has(key)) {
      let hit: { lat: number; lon: number; country: string } | null = null;
      const cc = r.country !== "??" ? r.country : "";
      if (r.city) {
        const a = cc ? cityAirport(r.city, cc) : null;
        if (a) hit = { lat: a.lat, lon: a.lon, country: a.country };
        else {
          const [g] = await geocode([r.city, countryName || cc].filter(Boolean).join(", "), 1).catch(() => []);
          if (g?.country) hit = { lat: g.lat, lon: g.lon, country: g.country };
        }
      } else {
        const [g] = await geocode(countryName || (cc ? countryNameOf(cc) : ""), 1).catch(() => []);
        if (g?.country && (!cc || g.country === cc)) hit = { lat: g.lat, lon: g.lon, country: g.country };
        else if (cc) {
          const c = countryCenter(cc);
          if (c) hit = { ...c, country: cc };
        }
      }
      cache.set(key, hit);
    }
    const hit = cache.get(key);
    if (!hit) {
      unresolved++;
      continue;
    }
    const country = r.country !== "??" ? r.country : hit.country;
    out.push({ ...rest, lat: hit.lat, lon: hit.lon, country, city: r.city || countryNameOf(country) + APPROX_SUFFIX });
  }
  return { rows: out, unresolved };
}
