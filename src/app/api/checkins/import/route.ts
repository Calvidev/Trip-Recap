import { NextResponse } from "next/server";
import { z } from "zod";
import { importCheckins } from "@/lib/trips";

const Row = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  city: z.string().min(1),
  country: z.string().length(2),
  source: z.string(),
});

/** POST [{date, time, lat, lon, city, country, source}, ...] — parsed client-side from a CSV. */
export async function POST(req: Request) {
  const parsed = z.array(Row).max(50000).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.slice(0, 5) }, { status: 400 });
  return NextResponse.json(importCheckins(parsed.data));
}
