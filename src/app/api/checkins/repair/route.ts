import { NextResponse } from "next/server";
import { reverseGeocode } from "@/lib/geocode";
import { countUnknownCheckins, repairUnknownCheckins } from "@/lib/trips";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  return NextResponse.json({ unknown: countUnknownCheckins() });
}

/** Looks up city/country again for check-ins stored as "Unknown". Call again while `remaining` > 0. */
export async function POST() {
  return NextResponse.json(await repairUnknownCheckins(reverseGeocode));
}
