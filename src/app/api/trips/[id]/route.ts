import { NextResponse } from "next/server";
import { deleteTrip, getTrip, TripSchema, updateTrip } from "@/lib/trips";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  if (!getTrip(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = TripSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  return NextResponse.json(updateTrip(id, parsed.data));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  deleteTrip(Number((await params).id));
  return new NextResponse(null, { status: 204 });
}
