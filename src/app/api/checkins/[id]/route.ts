import { NextResponse } from "next/server";
import { refreshDerived } from "@/lib/refresh";
import { deleteCheckin } from "@/lib/trips";


export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  deleteCheckin(Number((await params).id));
  refreshDerived();
  return new NextResponse(null, { status: 204 });
}
