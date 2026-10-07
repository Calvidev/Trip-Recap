import "server-only";
import { db } from "./db";
import { inferGapTrips, inferTrips, type InferredTrip } from "./autotrips-core";
import { createTrip, deleteTrip, listCheckins, listTrips } from "./trips";
import type { Trip } from "./types";

/**
 * Brings auto-detected trips in line with the current check-ins and trips.
 * Untouched auto trips that no longer apply are removed; ones you edited
 * (source "auto-edited") are kept; ones you deleted are remembered and not recreated.
 */
export function syncAutoTrips(): { added: number; removed: number } {
  const trips = listTrips();
  const real = trips.filter((t) => t.source !== "auto");
  const checkins = listCheckins();
  const logged = trips.filter((t) => !t.source.startsWith("auto")); // flights you took (Flighty, Gmail, by hand)
  const wanted: (InferredTrip & { groupId?: number | null })[] = [...inferTrips(checkins, real), ...inferGapTrips(logged, checkins)];
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
    const gap = w.externalId.startsWith("auto:gap:");
    const t = createTrip({
      mode: w.mode, origin: w.origin, dest: w.dest, departDate: w.date, arriveDate: w.date,
      departTime: w.departTime ?? null, arriveTime: w.arriveTime ?? null,
      notes: gap ? "Auto-detected: connects two of your flights (date and mode are a guess)" : note,
      source: "auto", externalId: w.externalId,
    });
    if (t) {
      added++;
      if (w.groupId != null) db().prepare("UPDATE trips SET group_id = ? WHERE id = ?").run(w.groupId, t.id);
    }
  }
  return { added, removed };
}

/** Called when a trip is deleted: an auto trip you removed shouldn't come back. */
export function rememberDismissed(externalId: string | null) {
  if (externalId?.startsWith("auto:")) db().prepare("INSERT OR IGNORE INTO auto_dismissed (external_id) VALUES (?)").run(externalId);
}

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;

/**
 * A guessed trip (auto or auto-edited) is replaced when real flights (Flighty,
 * email, Gmail or added by hand) explain it:
 * within 3 days of it, a flight leaves its origin country and a flight (possibly
 * a later connection) lands in its destination country — e.g. the guess
 * "San Pedro → Germany" is explained by MTY→DFW, DFW→LHR, LHR→HAJ.
 * Groups survive: real trips inside a group's date span join that group.
 */
export function replaceGuessesWithRealFlights(): number {
  const trips = listTrips();
  const flights = trips.filter((t) => t.mode === "flight" && !t.source.startsWith("auto"));
  const near = (f: Trip, g: Trip) => dayDiff(f.departDate, g.departDate) <= 3;

  // Date span of every group, taken before any guess is removed.
  const spans = new Map<number, { from: string; to: string }>();
  for (const t of trips) {
    if (t.groupId == null) continue;
    const s = spans.get(t.groupId);
    if (!s) spans.set(t.groupId, { from: t.departDate, to: t.arriveDate });
    else {
      if (t.departDate < s.from) s.from = t.departDate;
      if (t.arriveDate > s.to) s.to = t.arriveDate;
    }
  }

  // Legs that connect two flights (Hannover → Düsseldorf) are not guesses to replace.
  const gapIds = new Set((db().prepare("SELECT id FROM trips WHERE external_id LIKE 'auto:gap:%'").all() as { id: number }[]).map((r) => r.id));
  let n = 0;
  for (const g of trips.filter((t) => (t.source === "auto" || t.source === "auto-edited") && !gapIds.has(t.id))) {
    const leaves = flights.some((f) => near(f, g) && f.origin.country === g.origin.country);
    const lands = flights.some((f) => near(f, g) && f.dest.country === g.dest.country);
    if (!leaves || !lands) continue;
    rememberDismissed(deleteTrip(g.id));
    n++;
  }

  // Ungrouped real trips within a group's span (±1 day) join it.
  const setGroup = db().prepare("UPDATE trips SET group_id = ? WHERE id = ? AND group_id IS NULL");
  for (const [gid, s] of spans) {
    const from = shift(s.from, -1), to = shift(s.to, 1);
    for (const t of listTrips()) if (t.groupId == null && !t.source.startsWith("auto") && t.departDate >= from && t.departDate <= to) setGroup.run(gid, t.id);
  }
  return n;
}

const shift = (d: string, days: number) => new Date(Date.parse(d) + days * 86400000).toISOString().slice(0, 10);
