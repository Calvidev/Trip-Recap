import { NextResponse, type NextRequest } from "next/server";

// Single-user app: everything is protected by APP_TOKEN when it's set.
// Browsers log in once (cookie); the iPhone Shortcut / cron jobs send
// `Authorization: Bearer <APP_TOKEN>`.
export function middleware(req: NextRequest) {
  const token = process.env.APP_TOKEN;
  if (!token) return NextResponse.next();

  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const cookie = req.cookies.get("tr_token")?.value;
  if (bearer === token || cookie === token) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/login|_next/|favicon.ico|manifest.webmanifest|icon).*)"],
};
