import { countryName, haversineKm } from "./geo.ts";
import type { Trip } from "./types";

/**
 * Suggests groups of trips: each time you leave home and come back is one
 * journey (out, everything in between, back). Pure so it can be unit-tested.
 */

export interface Home {
  city: string;
  country: string;
  lat: number;
  lon: number;
}

export interface SuggestedGroup {
  name: string;
  tripIds: number[];
}

const HOME_KM = 80;

export function suggestGroups(trips: Trip[], home: Home, today: string): SuggestedGroup[] {
  const atHome = (p: { lat: number; lon: number }) => haversineKm(p.lat, p.lon, home.lat, home.lon) <= HOME_KM;
  const sorted = trips
    .filter((t) => t.departDate <= today)
    .sort((a, b) => a.departDate.localeCompare(b.departDate) || (a.departTime ?? "").localeCompare(b.departTime ?? "") || a.id - b.id);

  const out: SuggestedGroup[] = [];
  let cur: Trip[] = [];
  const close = () => {
    if (cur.length >= 2) out.push({ name: nameFor(cur, home), tripIds: cur.map((t) => t.id) });
    cur = [];
  };

  for (const t of sorted) {
    if (t.groupId != null) {
      close(); // already grouped by you: never regroup, and it ends any open journey
      continue;
    }
    if (atHome(t.origin) && !atHome(t.dest)) {
      close(); // leaving home starts a new journey (even if the last one never "came back")
      cur = [t];
    } else if (cur.length) {
      cur.push(t);
      if (atHome(t.dest)) close();
    }
  }
  close(); // still away: an ongoing journey
  return out;
}

function nameFor(legs: Trip[], home: Home): string {
  const month = new Date(`${legs[0].departDate}T12:00:00Z`).toLocaleDateString("en", { month: "short", year: "numeric", timeZone: "UTC" });
  const abroad = [...new Set(legs.map((t) => t.dest.country).filter((c) => c !== home.country))];
  const places = abroad.length
    ? abroad.map(countryName)
    : [...new Set(legs.map((t) => t.dest.city).filter((c) => c.toLowerCase() !== home.city.toLowerCase()))];
  const shown = places.slice(0, 3);
  const list = shown.length > 1 ? `${shown.slice(0, -1).join(", ")} & ${shown[shown.length - 1]}` : shown[0] ?? "Trip";
  return `${list}${places.length > 3 ? ` +${places.length - 3}` : ""} · ${month}`;
}
