import { NextResponse } from "next/server";
import { handleInboundEmail, listInbound } from "@/lib/inbound";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Receives forwarded booking emails from the Cloudflare Email Worker
 * (cloudflare/email-worker). Body: the raw email (message/rfc822).
 * Auth: Authorization: Bearer <APP_TOKEN> (checked by the middleware).
 */
export async function POST(req: Request) {
  const raw = await req.arrayBuffer();
  if (!raw.byteLength) return NextResponse.json({ error: "Empty body" }, { status: 400 });
  return NextResponse.json(await handleInboundEmail(raw));
}

/** Recent forwarded emails and what happened to each (shown in Settings). */
export async function GET() {
  return NextResponse.json({ address: process.env.INBOUND_EMAIL_ADDRESS || null, emails: listInbound() });
}
