import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!process.env.APP_TOKEN || token !== process.env.APP_TOKEN) {
    return NextResponse.json({ error: "Wrong token" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("tr_token", token, {
    httpOnly: true,
    sameSite: "lax",
    // Secure only over HTTPS (e.g. via Cloudflare), so plain-http LAN access still works.
    secure: req.headers.get("x-forwarded-proto") === "https" || new URL(req.url).protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
