const R = 6371; // km
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Points along the great circle between two coordinates, with longitudes
 * "unwrapped" so the line stays continuous across the antimeridian.
 */
export function greatCircle(lat1: number, lon1: number, lat2: number, lon2: number, n = 64): [number, number][] {
  const φ1 = rad(lat1), λ1 = rad(lon1), φ2 = rad(lat2), λ2 = rad(lon2);
  const d = 2 * Math.asin(Math.sqrt(Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2));
  if (d === 0) return [[lat1, lon1], [lat2, lon2]];
  const pts: [number, number][] = [];
  let prevLon = lon1;
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    let lon = deg(Math.atan2(y, x));
    while (lon - prevLon > 180) lon -= 360;
    while (lon - prevLon < -180) lon += 360;
    prevLon = lon;
    pts.push([deg(Math.atan2(z, Math.sqrt(x * x + y * y))), lon]);
  }
  return pts;
}

/** Rough block time for a flight when the user didn't enter times. */
export function estimateFlightMinutes(km: number): number {
  return Math.round((km / 820) * 60 + 30);
}

/** Minutes between two local date/times (ignores time zones unless offsets given). */
export function minutesBetween(d1: string, t1: string, d2: string, t2: string, tz1?: string, tz2?: string): number | null {
  const a = toUtcMs(d1, t1, tz1);
  const b = toUtcMs(d2, t2, tz2);
  if (a == null || b == null) return null;
  const m = Math.round((b - a) / 60000);
  return m > 0 ? m : null;
}

function toUtcMs(date: string, time: string, tz?: string): number | null {
  const naive = Date.parse(`${date}T${time}:00Z`);
  if (Number.isNaN(naive)) return null;
  if (!tz) return naive;
  try {
    // Offset of `tz` at that instant: format the naive UTC instant in tz and diff.
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(new Date(naive));
    const get = (t: string) => parts.find((p) => p.type === t)!.value;
    const asTz = Date.parse(`${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:00Z`);
    return naive - (asTz - naive);
  } catch {
    return naive;
  }
}

const regionNames = typeof Intl !== "undefined" ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
export function countryName(code: string): string {
  if (!code) return "Unknown";
  try {
    return regionNames?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function flagEmoji(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return "🏳️";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}
