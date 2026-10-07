import "server-only";
import { syncAutoTrips } from "./autotrips";
import { autoGroup } from "./groups";

/** Today in the server's time zone (TZ), as YYYY-MM-DD. */
export const serverToday = () => new Date().toLocaleDateString("en-CA");

/**
 * Re-derives everything that follows from trips and check-ins: guessed trips
 * (drives between cities, legs between flights) and trip groups. Call after any change.
 */
export function refreshDerived() {
  const autoTrips = syncAutoTrips();
  const groups = autoGroup(serverToday());
  return { autoTrips, groups: { created: groups.created.length, extended: groups.extended } };
}
