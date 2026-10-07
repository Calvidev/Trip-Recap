import "server-only";
import { cityAirport } from "./airports";
import { geocode } from "./geocode";
import type { LocationRow } from "./csv";
import type { Checkin } from "./types";

/**
 * Fills in coordinates for rows that only name a city (e.g. "Berlin, DE" with
 * empty lat/lon). Tries the offline airport list first, then OpenStreetMap,
 * once per distinct city. Rows that can't be placed are dropped.
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
      const a = r.country !== "??" ? cityAirport(r.city, r.country) : null;
      if (a) hit = { lat: a.lat, lon: a.lon, country: a.country };
      else {
        const [g] = await geocode([r.city, countryName || r.country].filter((x) => x && x !== "??").join(", "), 1).catch(() => []);
        if (g && g.country) hit = { lat: g.lat, lon: g.lon, country: g.country };
      }
      cache.set(key, hit);
    }
    const hit = cache.get(key);
    if (!hit) {
      unresolved++;
      continue;
    }
    out.push({ ...rest, lat: hit.lat, lon: hit.lon, country: r.country !== "??" ? r.country : hit.country });
  }
  return { rows: out, unresolved };
}
