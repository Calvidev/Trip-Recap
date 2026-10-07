import { NextResponse } from "next/server";
import { reverseGeocode } from "@/lib/geocode";
import { countUnknownCheckins, removeBadCheckins, repairUnknownCheckins } from "@/lib/trips";
import { syncAutoTrips } from "@/lib/autotrips";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  return NextResponse.json({ unknown: countUnknownCheckins() });
}

/** Looks up city/country again for check-ins stored as "Unknown". Call again while `remaining` > 0. */
export async function POST() {
  const removed = removeBadCheckins();
  const result = await repairUnknownCheckins(reverseGeocode);
  return NextResponse.json({ ...result, removed, autoTrips: syncAutoTrips() });
}
