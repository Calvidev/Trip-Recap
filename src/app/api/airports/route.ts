import { NextResponse } from "next/server";
import { searchAirports } from "@/lib/airports";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return NextResponse.json(searchAirports(q));
}
