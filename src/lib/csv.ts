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

/** A parsed row; coordinates may be missing when the row still names a city. */
export type LocationRow = Omit<Checkin, "id" | "lat" | "lon"> & { lat: number | null; lon: number | null; countryName: string };

const hasPlace = (city: string, cc: string, name: string) =>
  Boolean(city) && city !== "Unknown" && (/^[A-Za-z]{2}$/.test(cc) || Boolean(name));

/**
 * Parses a location log like the n8n "Tracker de Ubicación" CSV:
 *   date,lat,lon,city,countryName,countryCode,address
 * `date` may be YYYY-MM-DD or a full ISO timestamp; timestamps are converted to
 * the local date/time of the machine doing the import.
 * Rows without usable coordinates are kept (lat/lon = null) if they still name a
 * city, so the server can look that city up; rows with neither are skipped.
 */
export function parseLocationCsv(text: string): { rows: LocationRow[]; skipped: number } {
  const rows: LocationRow[] = [];
  let skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const [d, la, lo, cityRaw = "", nameRaw = "", ccRaw = ""] = splitCsvLine(raw);
    const city = cityRaw.trim(), name = nameRaw.trim(), cc = ccRaw.trim();
    // Note Number("") === 0: a row with no coordinates must not become 0,0 (off West Africa).
    const lat = la ? Number(la) : NaN, lon = lo ? Number(lo) : NaN;
    const coordsOk = isValidCoord(lat, lon);
    const m = d?.match(/^(\d{4}-\d{2}-\d{2})(T.*)?$/);
    if (!m || (!coordsOk && !hasPlace(city, cc, name))) {
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
      date, time,
      lat: coordsOk ? lat : null,
      lon: coordsOk ? lon : null,
      city: city || "Unknown",
      country: /^[A-Za-z]{2}$/.test(cc) ? cc.toUpperCase() : "??",
      countryName: name,
      source: "import",
    });
  }
  return { rows, skipped };
}
