import { NextResponse } from "next/server";
import { deleteCheckin } from "@/lib/trips";
import { syncAutoTrips } from "@/lib/autotrips";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  deleteCheckin(Number((await params).id));
  syncAutoTrips();
  return new NextResponse(null, { status: 204 });
}
