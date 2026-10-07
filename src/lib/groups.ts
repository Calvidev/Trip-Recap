import "server-only";
import { db } from "./db";
import { suggestGroups } from "./groups-core";
import { buildDayLog, totals } from "./stays";
import { listCheckins, listTrips } from "./trips";
import type { TripGroup } from "./types";

export function listGroups(): TripGroup[] {
  pruneEmpty(); // trips can disappear (deleted, auto trips re-synced)
  return db().prepare("SELECT id, name FROM trip_groups ORDER BY id").all() as TripGroup[];
}

export function createGroup(name: string, tripIds: number[]): TripGroup {
  const id = Number(db().prepare("INSERT INTO trip_groups (name) VALUES (?)").run(name.trim() || "Trip").lastInsertRowid);
  setTrips(id, tripIds);
  return { id, name };
}

export function setTrips(groupId: number | null, tripIds: number[]) {
  const st = db().prepare("UPDATE trips SET group_id = ? WHERE id = ?");
  db().transaction(() => tripIds.forEach((t) => st.run(groupId, t)))();
  pruneEmpty();
}

export function renameGroup(id: number, name: string) {
  db().prepare("UPDATE trip_groups SET name = ? WHERE id = ?").run(name.trim(), id);
}

/** Removes the group; its trips stay, just ungrouped. */
export function deleteGroup(id: number) {
  db().prepare("UPDATE trips SET group_id = NULL WHERE group_id = ?").run(id);
  db().prepare("DELETE FROM trip_groups WHERE id = ?").run(id);
}

function pruneEmpty() {
  db().prepare("DELETE FROM trip_groups WHERE id NOT IN (SELECT DISTINCT group_id FROM trips WHERE group_id IS NOT NULL)").run();
}

/** Groups ungrouped trips into journeys away from home (the city with the most nights). */
export function autoGroup(today: string): { created: TripGroup[] } {
  const trips = listTrips();
  const t = totals(buildDayLog(trips, listCheckins(), today));
  const top = t.cities[0] && [...t.cities].sort((a, b) => b.nights - a.nights)[0];
  if (!top) return { created: [] };
  const home = { city: top.label, country: top.country, lat: top.lat, lon: top.lon };
  return { created: suggestGroups(trips, home, today).map((g) => createGroup(g.name, g.tripIds)) };
}
