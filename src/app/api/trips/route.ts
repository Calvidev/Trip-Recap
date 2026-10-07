import { NextResponse } from "next/server";
import { createTrip, listTrips, TripSchema } from "@/lib/trips";
import { syncAutoTrips } from "@/lib/autotrips";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listTrips());
}

export async function POST(req: Request) {
  const parsed = TripSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  const trip = createTrip({ ...parsed.data, source: "manual" });
  syncAutoTrips(); // a trip you logged may explain an auto-detected move
  return NextResponse.json(trip, { status: 201 });
}
