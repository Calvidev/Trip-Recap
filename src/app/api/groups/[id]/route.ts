import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteGroup, renameGroup, setTrips } from "@/lib/groups";

type Ctx = { params: Promise<{ id: string }> };

/** { name?, addTripIds?, removeTripIds? } */
export async function PATCH(req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const p = z
    .object({ name: z.string().min(1).max(120).optional(), addTripIds: z.array(z.number().int()).optional(), removeTripIds: z.array(z.number().int()).optional() })
    .safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: p.error.issues }, { status: 400 });
  if (p.data.name) renameGroup(id, p.data.name);
  if (p.data.addTripIds?.length) setTrips(id, p.data.addTripIds);
  if (p.data.removeTripIds?.length) setTrips(null, p.data.removeTripIds);
  return NextResponse.json({ ok: true });
}

/** Ungroups: the trips stay. */
export async function DELETE(_req: Request, { params }: Ctx) {
  deleteGroup(Number((await params).id));
  return new NextResponse(null, { status: 204 });
}
