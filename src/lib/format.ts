import type { Mode, Trip } from "./types";

export const MODE_META: Record<Mode, { label: string; icon: string; color: string; dash?: string }> = {
  flight: { label: "Flight", icon: "✈️", color: "#60a5fa" },
  train: { label: "Train", icon: "🚆", color: "#f59e0b", dash: "8 8" },
  drive: { label: "Drive", icon: "🚗", color: "#34d399", dash: "2 7" },
  bus: { label: "Bus", icon: "🚌", color: "#c084fc", dash: "2 7" },
  ferry: { label: "Ferry", icon: "⛴️", color: "#22d3ee", dash: "10 6" },
};

export const fmtKm = (km: number) => `${Math.round(km).toLocaleString()} km`;

export function fmtDuration(min: number | null | undefined): string {
  if (!min) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${m.toString().padStart(2, "0")}m` : `${m}m`;
}

export function fmtDate(d: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" });
}

export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const tripLabel = (t: Trip) => `${t.origin.code || t.origin.city} → ${t.dest.code || t.dest.city}`;

// Schengen area members (for the 90/180-day rule).
export const SCHENGEN = "AT BE BG HR CZ DK EE FI FR DE GR HU IS IT LV LI LT LU MT NL NO PL PT RO SK SI ES SE CH".split(" ");
