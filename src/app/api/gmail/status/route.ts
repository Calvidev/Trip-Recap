import { NextResponse } from "next/server";
import { getSetting } from "@/lib/db";
import { disconnect, gmailConfigured, gmailConnected } from "@/lib/gmail";
import { claudeEnabled } from "@/lib/extract";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    configured: gmailConfigured(),
    connected: gmailConnected(),
    lastSync: getSetting("gmail_last_sync"),
    claude: claudeEnabled(),
  });
}

export async function DELETE() {
  disconnect();
  return NextResponse.json({ ok: true });
}
