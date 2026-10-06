import "server-only";
import data from "@/data/airports.json";
import type { Place } from "./types";

type Row = [name: string, city: string, country: string, lat: number, lon: number, tz: string];
const AIRPORTS = data as unknown as Record<string, Row>;

export interface Airport extends Place {
  code: string;
  tz: string;
}

export function airport(code: string | null | undefined): Airport | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  const r = AIRPORTS[c];
  if (!r) return null;
  return { code: c, name: r[0], city: r[1], country: r[2], lat: r[3], lon: r[4], tz: r[5] };
}

// Big hubs first when several airports match a city search.
const HUBS = new Set("ATL DXB DFW LHR HND DEN IST LAX ORD DEL CDG JFK AMS MAD FRA SIN ICN BKK CAN PEK PVG MEX CUN GDL MTY BOG GRU LIM SCL EZE YYZ YVR SFO SEA MIA LAS MCO EWR BOS IAH PHX FCO BCN MUC ZRH LGW DUB LIS CPH ARN OSL HEL VIE SYD MEL NRT KIX HKG TPE MNL KUL CGK DOH AUH JNB CAI".split(" "));

export function searchAirports(q: string, limit = 8): Airport[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const exact = s.length === 3 ? airport(s) : null;
  const out: { a: Airport; score: number }[] = [];
  for (const code of Object.keys(AIRPORTS)) {
    if (exact && code === exact.code) continue;
    const r = AIRPORTS[code];
    const city = r[1].toLowerCase();
    const name = r[0].toLowerCase();
    let score = 0;
    if (code.toLowerCase().startsWith(s)) score = 3;
    else if (city.startsWith(s)) score = 2;
    else if (name.includes(s) || city.includes(s)) score = 1;
    if (!score) continue;
    if (HUBS.has(code)) score += 0.5;
    if (/international/i.test(r[0])) score += 0.2;
    out.push({ a: airport(code)!, score });
  }
  out.sort((x, y) => y.score - x.score);
  return [...(exact ? [exact] : []), ...out.slice(0, limit).map((o) => o.a)].slice(0, limit);
}

/** Offline fallback for reverse geocoding: city/country of the nearest airport. */
export function nearestAirport(lat: number, lon: number): Airport | null {
  let best: string | null = null;
  let bestD = Infinity;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  for (const code in AIRPORTS) {
    const r = AIRPORTS[code];
    let dLon = Math.abs(r[4] - lon);
    if (dLon > 180) dLon = 360 - dLon;
    const d = (r[3] - lat) ** 2 + (dLon * cosLat) ** 2;
    if (d < bestD) { bestD = d; best = code; }
  }
  return airport(best);
}
