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

export interface GroupSuggestions {
  groups: SuggestedGroup[]; // new journeys
  extend: { groupId: number; tripIds: number[] }[]; // new legs of a journey that's already a group
}

const HOME_KM = 80;

export function suggestGroups(trips: Trip[], home: Home, today: string): GroupSuggestions {
  const atHome = (p: { lat: number; lon: number }) => haversineKm(p.lat, p.lon, home.lat, home.lon) <= HOME_KM;
  const sorted = trips
    .filter((t) => t.departDate <= today)
    .sort((a, b) => a.departDate.localeCompare(b.departDate) || (a.departTime ?? "").localeCompare(b.departTime ?? "") || a.id - b.id);

  const groups: SuggestedGroup[] = [];
  const extend = new Map<number, number[]>();
  let cur: Trip[] = [];
  let open: number | null = null; // a group whose journey hasn't come home yet
  const close = () => {
    if (cur.length >= 2) groups.push({ name: nameFor(cur, home), tripIds: cur.map((t) => t.id) });
    cur = [];
  };

  for (const t of sorted) {
    if (t.noGroup) {
      close(); // you took this one out of a group: leave it, and it ends any open journey
      open = null;
      continue;
    }
    if (t.groupId != null) {
      close(); // already grouped: never regroup
      open = atHome(t.dest) ? null : t.groupId;
      continue;
    }
    if (open != null && !(atHome(t.origin) && !atHome(t.dest))) {
      // Still on a trip that's already a group (e.g. the flight home came in later).
      extend.set(open, [...(extend.get(open) ?? []), t.id]);
      if (atHome(t.dest)) open = null;
      continue;
    }
    open = null;
    if (atHome(t.origin) && !atHome(t.dest)) {
      close(); // leaving home starts a new journey (even if the last one never "came back")
      cur = [t];
    } else if (cur.length) {
      cur.push(t);
      if (atHome(t.dest)) close();
    }
  }
  close(); // still away: an ongoing journey
  return { groups, extend: [...extend].map(([groupId, tripIds]) => ({ groupId, tripIds })) };
}

function nameFor(legs: Trip[], home: Home): string {
  const month = new Date(`${legs[0].departDate}T12:00:00Z`).toLocaleDateString("en", { month: "short", year: "numeric", timeZone: "UTC" });
  // Countries where you only changed planes (left again the same day) don't name the trip.
  const stayed = legs.filter((t, i) => i === legs.length - 1 || legs[i + 1].departDate > t.arriveDate);
  const abroad = [...new Set(stayed.map((t) => t.dest.country).filter((c) => c !== home.country))];
  const places = abroad.length
    ? abroad.map(countryName)
    : [...new Set(legs.map((t) => t.dest.city).filter((c) => c.toLowerCase() !== home.city.toLowerCase()))];
  const shown = places.slice(0, 3);
  const list = shown.length > 1 ? `${shown.slice(0, -1).join(", ")} & ${shown[shown.length - 1]}` : shown[0] ?? "Trip";
  return `${list}${places.length > 3 ? ` +${places.length - 3}` : ""} · ${month}`;
}
