import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode } from "@/lib/gmail";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const back = new URL("/?tab=settings", process.env.APP_URL || url.origin);
  if (!code || !state || state !== req.cookies.get("gmail_state")?.value) {
    back.searchParams.set("gmail", "error");
    return NextResponse.redirect(back);
  }
  try {
    await exchangeCode(code, url.origin);
    back.searchParams.set("gmail", "connected");
  } catch (e) {
    back.searchParams.set("gmail", (e as Error).message);
  }
  const res = NextResponse.redirect(back);
  res.cookies.delete("gmail_state");
  return res;
}
