import "server-only";
import type { Place } from "./types";
import { nearestAirport } from "./airports";
import { haversineKm } from "./geo";

// OpenStreetMap Nominatim: free, no API key. Usage policy: max ~1 req/s and a
// descriptive User-Agent. Fine for a personal travel log.
const BASE = process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org";
const UA = process.env.NOMINATIM_USER_AGENT || "trip-recap/0.1 (personal travel log)";

let last = 0;
async function politeFetch(url: string) {
  const wait = last + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Geocoder error ${res.status}`);
  return res.json();
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  address?: Record<string, string>;
}

function cityOf(addr: Record<string, string> = {}, fallback = ""): string {
  return addr.city || addr.town || addr.village || addr.municipality || addr.hamlet || addr.county || addr.state || fallback;
}

function toPlace(r: NominatimResult): Place {
  const addr = r.address ?? {};
  const city = cityOf(addr, r.name || r.display_name.split(",")[0]);
  const country = (addr.country_code || "").toUpperCase();
  const name = r.name && r.name !== city ? `${r.name}, ${city}` : [city, addr.state, addr.country].filter(Boolean).slice(0, 2).join(", ");
  return { name, city, country, lat: +r.lat, lon: +r.lon, code: null };
}

export async function geocode(q: string, limit = 5): Promise<Place[]> {
  const url = `${BASE}/search?format=jsonv2&addressdetails=1&limit=${limit}&q=${encodeURIComponent(q)}`;
  const rows = (await politeFetch(url)) as NominatimResult[];
  return rows.map(toPlace);
}

export async function reverseGeocode(lat: number, lon: number): Promise<{ city: string; country: string }> {
  try {
    const url = `${BASE}/reverse?format=jsonv2&zoom=10&addressdetails=1&lat=${lat}&lon=${lon}`;
    const r = (await politeFetch(url)) as NominatimResult;
    if (r.address?.country_code) return { city: cityOf(r.address, "Unknown"), country: r.address.country_code.toUpperCase() };
  } catch {
    /* fall through to offline lookup */
  }
  // Only trust the nearest airport if it's actually close; in the middle of the
  // ocean (or at a bogus 0,0) "nearest" can be a thousand km away.
  const a = nearestAirport(lat, lon);
  return a && haversineKm(lat, lon, a.lat, a.lon) <= 100 ? { city: a.city, country: a.country } : { city: "Unknown", country: "??" };
}
