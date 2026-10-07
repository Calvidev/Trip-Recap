import { NextResponse } from "next/server";
import { z } from "zod";
import { parseLocationCsv } from "@/lib/csv";
import { isFlightyCsv } from "@/lib/flighty";
import { importFlighty } from "@/lib/flighty-import";
import { resolveRows } from "@/lib/locate";
import { importCheckins } from "@/lib/trips";
import { syncAutoTrips } from "@/lib/autotrips";

const Row = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  city: z.string().min(1),
  country: z.string().length(2),
  source: z.string(),
});

/**
 * Bulk import of check-ins, skipping duplicates. Accepts either
 *  - JSON: [{date, time, lat, lon, city, country, source}, ...] (the UI parses CSV in the browser), or
 *  - a raw CSV body with Content-Type: text/csv, e.g. from the server:
 *      curl -X POST --data-binary @ubicaciones.csv -H "Content-Type: text/csv" \
 *        -H "Authorization: Bearer $APP_TOKEN" http://localhost:3100/api/checkins/import
 */
export const maxDuration = 300;

export async function POST(req: Request) {
  if (req.headers.get("content-type")?.startsWith("text/")) {
    const text = await req.text();
    if (isFlightyCsv(text)) return NextResponse.json({ flighty: importFlighty(text) });
    const parsed = parseLocationCsv(text);
    const { rows, unresolved } = await resolveRows(parsed.rows);
    const result = importCheckins(rows);
    return NextResponse.json({ ...result, skipped: parsed.skipped + unresolved, autoTrips: syncAutoTrips() });
  }
  const parsed = z.array(Row).max(50000).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.slice(0, 5) }, { status: 400 });
  const result = importCheckins(parsed.data);
  return NextResponse.json({ ...result, autoTrips: syncAutoTrips() });
}
