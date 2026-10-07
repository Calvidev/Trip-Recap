import "server-only";
import { db } from "./db";
import { inferTrips } from "./autotrips-core";
import { createTrip, listCheckins, listTrips } from "./trips";

/**
 * Brings auto-detected trips in line with the current check-ins and trips.
 * Untouched auto trips that no longer apply are removed; ones you edited
 * (source "auto-edited") are kept; ones you deleted are remembered and not recreated.
 */
export function syncAutoTrips(): { added: number; removed: number } {
  const trips = listTrips();
  const real = trips.filter((t) => t.source !== "auto");
  const wanted = inferTrips(listCheckins(), real);
  const wantedIds = new Set(wanted.map((w) => w.externalId));

  const dismissed = new Set((db().prepare("SELECT external_id FROM auto_dismissed").all() as { external_id: string }[]).map((r) => r.external_id));
  const existing = db().prepare("SELECT id, external_id, source FROM trips WHERE external_id LIKE 'auto:%'").all() as { id: number; external_id: string; source: string }[];
  const existingIds = new Set(existing.map((e) => e.external_id));

  let removed = 0;
  const del = db().prepare("DELETE FROM trips WHERE id = ?");
  for (const e of existing) {
    if (e.source === "auto" && !wantedIds.has(e.external_id)) {
      del.run(e.id);
      removed++;
    }
  }
  let added = 0;
  for (const w of wanted) {
    if (existingIds.has(w.externalId) || dismissed.has(w.externalId)) continue;
    const note = w.fromDate === w.date ? "Auto-detected from your check-ins" : `Auto-detected: last seen in ${w.origin.city} on ${w.fromDate}`;
    if (createTrip({ mode: w.mode, origin: w.origin, dest: w.dest, departDate: w.date, arriveDate: w.date, notes: note, source: "auto", externalId: w.externalId })) added++;
  }
  return { added, removed };
}

/** Called when a trip is deleted: an auto trip you removed shouldn't come back. */
export function rememberDismissed(externalId: string | null) {
  if (externalId?.startsWith("auto:")) db().prepare("INSERT OR IGNORE INTO auto_dismissed (external_id) VALUES (?)").run(externalId);
}
