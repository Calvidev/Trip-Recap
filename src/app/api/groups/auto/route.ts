import { NextResponse } from "next/server";
import { autoGroup } from "@/lib/groups";

/** Creates a group for each journey away from home among your ungrouped trips. */
export async function POST(req: Request) {
  const today = new URL(req.url).searchParams.get("today") ?? new Date().toISOString().slice(0, 10);
  return NextResponse.json(autoGroup(today));
}
