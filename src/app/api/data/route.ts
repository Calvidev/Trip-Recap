import { NextResponse } from "next/server";
import { refreshDerived } from "@/lib/refresh";
import { listCheckins, listTrips, removeBadCheckins } from "@/lib/trips";
import { listGroups } from "@/lib/groups";


let cleaned = false;

export const dynamic = "force-dynamic";

/** Everything the dashboard needs in one request (also a handy JSON backup). */
export async function GET() {
  if (!cleaned) {
    cleaned = true;
    removeBadCheckins();
    refreshDerived(); // once per start: guessed trips and groups for data from older versions
  }
  return NextResponse.json({ trips: listTrips(), checkins: listCheckins(), groups: listGroups() });
}
