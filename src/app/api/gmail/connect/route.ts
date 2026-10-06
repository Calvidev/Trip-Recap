import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { authUrl, gmailConfigured } from "@/lib/gmail";

export async function GET(req: Request) {
  if (!gmailConfigured()) return NextResponse.json({ error: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET" }, { status: 400 });
  const state = crypto.randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authUrl(new URL(req.url).origin, state));
  res.cookies.set("gmail_state", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
