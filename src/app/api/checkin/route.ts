import { NextResponse } from "next/server";
import { z } from "zod";
import { reverseGeocode } from "@/lib/geocode";
import { addCheckin } from "@/lib/trips";

export const dynamic = "force-dynamic";

/**
 * Endpoint for the nightly iPhone Shortcut (see docs/IPHONE_SHORTCUT.md).
 *   POST /api/checkin  Authorization: Bearer <APP_TOKEN>
 *   { "lat": 48.85, "lon": 2.35, "date": "2026-10-06", "time": "23:00" }
 * Shortcuts' location output is also accepted as "latitude"/"longitude" strings.
 * `city`/`country` are optional; if missing we reverse-geocode.
 */
const num = z.union([z.number(), z.string().transform((s) => Number(s.replace(",", ".")))]).pipe(z.number().finite());
const Schema = z.object({
  lat: num.optional(),
  lon: num.optional(),
  latitude: num.optional(),
  longitude: num.optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().regex(/^\d{1,2}:\d{2}/).optional(),
  city: z.string().optional(),
  country: z.string().length(2).optional(),
  source: z.string().optional(),
});

export async function POST(req: Request) {
  const raw = await req.json().catch(() => null);
  const p = Schema.safeParse(raw);
  if (!p.success) return NextResponse.json({ error: p.error.issues }, { status: 400 });
  const lat = p.data.lat ?? p.data.latitude;
  const lon = p.data.lon ?? p.data.longitude;
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: "lat/lon required" }, { status: 400 });
  }
  const now = new Date();
  const date = p.data.date ?? now.toISOString().slice(0, 10);
  const time = p.data.time ? p.data.time.slice(0, 5).padStart(5, "0") : null;
  const where = p.data.city && p.data.country ? { city: p.data.city, country: p.data.country.toUpperCase() } : await reverseGeocode(lat, lon);
  const c = addCheckin({ date, time, lat, lon, ...where, source: p.data.source ?? "shortcut" });
  return NextResponse.json({ ok: true, message: `Logged ${c.city}, ${c.country} for ${c.date}`, checkin: c }, { status: 201 });
}
