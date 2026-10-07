"use client";
import { useMemo, useState } from "react";
import { countryName, flagEmoji } from "@/lib/geo";
import { fmtDate, SCHENGEN, localToday } from "@/lib/format";
import { rollingDays, type DayEntry, type Totals } from "@/lib/stays";
import { countryColors } from "@/lib/countryColors";
import { APPROX_SUFFIX } from "@/lib/places";
import { NightsShare, YearCalendar } from "./CountryViz";

interface Props {
  totals: Totals; // for the selected year (or all time)
  log: DayEntry[]; // every day, all time
  year: number | "all";
}

/** "Germany (city unknown)" → name "Germany" + a quiet "city unknown" note. */
export function cityLabel(city: string) {
  return city.endsWith(APPROX_SUFFIX) ? { name: city.slice(0, -APPROX_SUFFIX.length), approx: true } : { name: city, approx: false };
}

export default function PlacesPanel({ totals, log, year }: Props) {
  const [view, setView] = useState<"countries" | "cities" | "stays">("countries");
  const colors = useMemo(() => countryColors(log), [log]);
  const years = useMemo(() => (year === "all" ? [...new Set(log.map((d) => +d.date.slice(0, 4)))].sort((a, b) => b - a) : [year]), [log, year]);
  const schengen = rollingDays(log, SCHENGEN, localToday(), 180);
  const isAllTime = year === "all";

  if (!totals.trackedDays) {
    return <p className="py-10 text-center text-muted">Add trips or check-ins and your days per country and city show up here.</p>;
  }
  const rows = view === "countries" ? totals.countries : totals.cities;

  return (
    <div className="space-y-4">
      <NightsShare totals={totals} colors={colors} />
      <YearCalendar log={log} colors={colors} years={years} />

      {schengen > 0 && (
        <div className="card flex items-center justify-between text-sm">
          <span>🇪🇺 Schengen, last 180 days</span>
          <span className={`font-semibold tabular-nums ${schengen > 80 ? "text-red-400" : schengen > 60 ? "text-amber-400" : ""}`}>{schengen} / 90 days</span>
        </div>
      )}

      <div className="flex gap-2">
        {(["countries", "cities", "stays"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className={`chip capitalize ${view === v ? "chip-on" : ""}`}>{v}</button>
        ))}
      </div>

      {view === "stays" ? (
        <ul className="space-y-2">
          {totals.stays.map((s, i) => {
            const c = cityLabel(s.place.city);
            return (
              <li key={i} className="card flex items-center gap-3 py-3">
                <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: colors.color(s.place.country) }} />
                <span className="text-xl">{flagEmoji(s.place.country)}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{c.name}{c.approx && <span className="ml-1.5 text-xs font-normal text-muted">city unknown</span>}</div>
                  <div className="text-xs text-muted">
                    {fmtDate(s.from, { day: "numeric", month: "short", year: "numeric" })}
                    {s.to !== s.from && ` – ${fmtDate(s.to, { day: "numeric", month: "short", year: "numeric" })}`}
                  </div>
                </div>
                <div className="text-sm font-semibold tabular-nums">{s.nights} {s.nights === 1 ? "night" : "nights"}</div>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel-2">
          {rows.map((r) => {
            const c = cityLabel(r.label);
            return (
              <li key={r.key} className="flex items-center gap-3 px-3 py-2.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: colors.color(r.country) }} />
                <span className="text-lg">{flagEmoji(r.country)}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {view === "countries" ? countryName(r.country) : c.name}
                    {view === "cities" && c.approx && <span className="ml-1.5 text-xs font-normal text-muted">city unknown</span>}
                  </div>
                  <div className="text-[11px] text-muted">
                    {view === "cities" && `${countryName(r.country)} · `}
                    {isAllTime ? `${fmtDate(r.first, { month: "short", year: "numeric" })} – ${fmtDate(r.last, { month: "short", year: "numeric" })}` : `last ${fmtDate(r.last, { day: "numeric", month: "short" })}`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold tabular-nums">{r.days} <span className="text-xs font-normal text-muted">days</span></div>
                  <div className="text-[11px] tabular-nums text-muted">{r.nights} nights</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted">
        <b>Nights</b> = where you slept. <b>Days</b> = any day you were there, so a travel day counts for both ends (how visa and residency rules count). Nights on a plane count as in transit.
      </p>
    </div>
  );
}
