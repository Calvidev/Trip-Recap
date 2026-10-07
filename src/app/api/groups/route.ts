import { NextResponse } from "next/server";
import { z } from "zod";
import { createGroup, listGroups } from "@/lib/groups";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listGroups());
}

/** { name, tripIds } → new group containing those trips (moved out of any previous group). */
export async function POST(req: Request) {
  const p = z.object({ name: z.string().min(1).max(120), tripIds: z.array(z.number().int()).min(1) }).safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: p.error.issues }, { status: 400 });
  return NextResponse.json(createGroup(p.data.name, p.data.tripIds), { status: 201 });
}
