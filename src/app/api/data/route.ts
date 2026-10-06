import { NextResponse } from "next/server";
import { listCheckins, listTrips } from "@/lib/trips";

export const dynamic = "force-dynamic";

/** Everything the dashboard needs in one request (also a handy JSON backup). */
export async function GET() {
  return NextResponse.json({ trips: listTrips(), checkins: listCheckins() });
}
