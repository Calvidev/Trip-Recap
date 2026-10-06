"use client";
import { useState } from "react";
import { countryName, flagEmoji } from "@/lib/geo";
import { fmtDate, SCHENGEN, localToday } from "@/lib/format";
import { rollingDays, type DayEntry, type Totals } from "@/lib/stays";

interface Props {
  totals: Totals;
  log: DayEntry[];
  isAllTime: boolean;
}

export default function PlacesPanel({ totals, log, isAllTime }: Props) {
  const [view, setView] = useState<"countries" | "cities" | "stays">("countries");
  const [metric, setMetric] = useState<"days" | "nights">("days");
  const rows = view === "countries" ? totals.countries : totals.cities;
  const max = Math.max(1, ...rows.map((r) => r[metric]));
  const schengen = rollingDays(log, SCHENGEN, localToday(), 180);

  if (!totals.trackedDays) {
    return <p className="py-10 text-center text-muted">Add trips or check-ins and your days per country and city show up here.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat n={totals.countries.length} label="countries" />
        <Stat n={totals.cities.length} label="cities" />
        <Stat n={totals.trackedDays} label="days tracked" />
      </div>

      {schengen > 0 && (
        <div className="card flex items-center justify-between text-sm">
          <span>🇪🇺 Schengen, last 180 days</span>
          <span className={`font-semibold ${schengen > 80 ? "text-red-400" : schengen > 60 ? "text-amber-400" : ""}`}>{schengen} / 90 days</span>
        </div>
      )}

      <div className="flex gap-2">
        {(["countries", "cities", "stays"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className={`chip capitalize ${view === v ? "chip-on" : ""}`}>{v}</button>
        ))}
        {view !== "stays" && (
          <button onClick={() => setMetric(metric === "days" ? "nights" : "days")} className="chip ml-auto">
            by {metric}
          </button>
        )}
      </div>

      {view === "stays" ? (
        <ul className="space-y-2">
          {totals.stays.map((s, i) => (
            <li key={i} className="card flex items-center gap-3 py-3">
              <span className="text-xl">{flagEmoji(s.place.country)}</span>
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{s.place.city}</div>
                <div className="text-xs text-muted">
                  {fmtDate(s.from, { day: "numeric", month: "short", year: "numeric" })}
                  {s.to !== s.from && ` – ${fmtDate(s.to, { day: "numeric", month: "short", year: "numeric" })}`}
                </div>
              </div>
              <div className="text-sm font-semibold">{s.nights} {s.nights === 1 ? "night" : "nights"}</div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.key} className="relative overflow-hidden rounded-xl border border-line bg-panel-2 px-3 py-2.5">
              <div className="absolute inset-y-0 left-0 bg-accent/15" style={{ width: `${(100 * r[metric]) / max}%` }} />
              <div className="relative flex items-center gap-3">
                <span className="text-lg">{flagEmoji(r.country)}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{view === "countries" ? countryName(r.country) : r.label}</div>
                  <div className="text-[11px] text-muted">
                    {view === "cities" && `${countryName(r.country)} · `}
                    {isAllTime ? `${fmtDate(r.first, { month: "short", year: "numeric" })} – ${fmtDate(r.last, { month: "short", year: "numeric" })}` : `last ${fmtDate(r.last, { day: "numeric", month: "short" })}`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold tabular-nums">{r[metric]}</div>
                  <div className="text-[11px] text-muted tabular-nums">{metric === "days" ? `${r.nights} nights` : `${r.days} days`}</div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">
        <b>Days</b> = any day you were there (travel days count for both ends). <b>Nights</b> = where you slept. Nights on a plane/overnight train count as in transit.
      </p>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="card py-3">
      <div className="text-2xl font-bold tabular-nums">{n}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}
