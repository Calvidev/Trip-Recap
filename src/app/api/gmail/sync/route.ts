import { NextResponse } from "next/server";
import { syncGmail } from "@/lib/gmail";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST from the UI, or from a cron/Shortcut with `Authorization: Bearer <APP_TOKEN>`. */
export async function POST(req: Request) {
  const max = Number(new URL(req.url).searchParams.get("max")) || 100;
  try {
    return NextResponse.json(await syncGmail({ maxMessages: Math.min(max, 500) }));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
