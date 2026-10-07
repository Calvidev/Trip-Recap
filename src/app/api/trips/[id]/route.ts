import { NextResponse } from "next/server";
import { refreshDerived } from "@/lib/refresh";
import { deleteTrip, getTrip, TripSchema, updateTrip } from "@/lib/trips";
import { rememberDismissed } from "@/lib/autotrips";


type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  if (!getTrip(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = TripSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  const trip = updateTrip(id, parsed.data);
  refreshDerived();
  return NextResponse.json(trip);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  rememberDismissed(deleteTrip(Number((await params).id)));
  refreshDerived();
  return new NextResponse(null, { status: 204 });
}
