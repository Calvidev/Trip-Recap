import type { Checkin } from "./types";

/** Minimal CSV line splitter with support for "quoted, fields" and "" escapes. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Real coordinates: in range and not the 0,0 a missing GPS fix turns into. */
export function isValidCoord(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Parses a location log like the n8n "Tracker de Ubicación" CSV:
 *   date,lat,lon,city,countryName,countryCode,address
 * `date` may be YYYY-MM-DD or a full ISO timestamp; timestamps are converted to
 * the local date/time of the machine doing the import (your browser).
 * Rows that don't start with a date + coordinates (e.g. a header) are skipped.
 */
export function parseLocationCsv(text: string): { rows: Omit<Checkin, "id">[]; skipped: number } {
  const rows: Omit<Checkin, "id">[] = [];
  let skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const [d, la, lo, city, , cc] = splitCsvLine(raw);
    // Note Number("") === 0: a row with no coordinates must not become 0,0 (off West Africa).
    const lat = la ? Number(la) : NaN, lon = lo ? Number(lo) : NaN;
    const m = d?.match(/^(\d{4}-\d{2}-\d{2})(T.*)?$/);
    if (!m || !isValidCoord(lat, lon)) {
      skipped++;
      continue;
    }
    let date = m[1];
    let time: string | null = null;
    if (m[2]) {
      const t = new Date(d);
      if (!Number.isNaN(t.getTime())) {
        date = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
        time = `${pad(t.getHours())}:${pad(t.getMinutes())}`;
      }
    }
    rows.push({
      date, time, lat, lon,
      city: city || "Unknown",
      country: /^[A-Za-z]{2}$/.test(cc ?? "") ? cc!.toUpperCase() : "??",
      source: "import",
    });
  }
  return { rows, skipped };
}
