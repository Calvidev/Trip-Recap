import { NextResponse } from "next/server";
import { listCheckins, listTrips, removeBadCheckins } from "@/lib/trips";
import { listGroups } from "@/lib/groups";
import { syncAutoTrips } from "@/lib/autotrips";

let cleaned = false;

export const dynamic = "force-dynamic";

/** Everything the dashboard needs in one request (also a handy JSON backup). */
export async function GET() {
  if (!cleaned) {
    cleaned = true;
    if (removeBadCheckins() > 0) syncAutoTrips(); // drops auto trips that came from bad rows
  }
  return NextResponse.json({ trips: listTrips(), checkins: listCheckins(), groups: listGroups() });
}
