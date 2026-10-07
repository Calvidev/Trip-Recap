"use client";
import { useMemo, useState } from "react";
import { countryName, flagEmoji } from "@/lib/geo";
import { fmtDate } from "@/lib/format";
import { OTHER_COLOR, type CountryColors } from "@/lib/countryColors";
import type { DayEntry, Totals } from "@/lib/stays";

/** Part-to-whole: where your nights went, as one stacked bar + legend rows. */
export function NightsShare({ totals, colors }: { totals: Totals; colors: CountryColors }) {
  const rows = useMemo(() => {
    const named = totals.countries.filter((c) => colors.named.has(c.key) && c.nights > 0);
    const other = totals.countries.filter((c) => !colors.named.has(c.key) && c.nights > 0);
    const out = named.map((c) => ({ key: c.key, label: countryName(c.key), flag: flagEmoji(c.key), nights: c.nights, color: colors.color(c.key) }));
    const otherNights = other.reduce((s, c) => s + c.nights, 0);
    if (otherNights) out.push({ key: "other", label: `${other.length} other ${other.length === 1 ? "country" : "countries"}`, flag: "🌐", nights: otherNights, color: OTHER_COLOR });
    return out.sort((a, b) => b.nights - a.nights);
  }, [totals, colors]);
  const total = rows.reduce((s, r) => s + r.nights, 0);
  if (!total) return null;
  const abroad = colors.home ? total - (rows.find((r) => r.key === colors.home)?.nights ?? 0) : 0;
  const pct = (n: number) => (n / total < 0.01 ? "<1%" : `${Math.round((100 * n) / total)}%`);

  return (
    <div className="card space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted">Where you slept</div>
        <div className="text-xs text-muted">{total} nights</div>
      </div>
      {colors.home && (
        <div>
          <span className="text-3xl font-bold tabular-nums">{abroad}</span>
          <span className="ml-1.5 text-sm text-muted">nights abroad · {pct(abroad)}</span>
        </div>
      )}
      {/* 2px surface gaps between segments, rounded outer ends */}
      <div className="flex h-3.5 w-full gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={rows.map((r) => `${r.label} ${r.nights} nights`).join(", ")}>
        {rows.map((r) => (
          <div key={r.key} title={`${r.label}: ${r.nights} nights (${pct(r.nights)})`} style={{ flexGrow: r.nights, flexBasis: 0, minWidth: 3, background: r.color }} />
        ))}
      </div>
      <ul className="space-y-1.5 text-sm">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: r.color }} />
            <span className="min-w-0 flex-1 truncate">
              {r.flag} {r.label}
              {r.key === colors.home && <span className="ml-1.5 text-xs text-muted">home</span>}
            </span>
            <span className="tabular-nums">{r.nights}</span>
            <span className="w-10 text-right text-xs tabular-nums text-muted">{pct(r.nights)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const MONTHS = Array.from({ length: 12 }, (_, m) => new Date(Date.UTC(2026, m, 15)).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" }));
const pad = (n: number) => String(n).padStart(2, "0");

/** Day-by-day calendar: one row per month, each day coloured by the country you slept in. */
export function YearCalendar({ log, colors, years }: { log: DayEntry[]; colors: CountryColors; years: number[] }) {
  const byDate = useMemo(() => new Map(log.map((d) => [d.date, d])), [log]);
  const [picked, setPicked] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? years : years.slice(0, 2);
  const pickedDay = picked ? byDate.get(picked) : undefined;

  return (
    <div className="card space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted">Day by day</div>
        <div className="text-xs text-muted">tap a day</div>
      </div>
      {shown.map((y) => {
        const present = new Set<string>();
        for (let m = 0; m < 12; m++) for (let d = 1; d <= 31; d++) { const e = byDate.get(`${y}-${pad(m + 1)}-${pad(d)}`); if (e?.night) present.add(e.night.country); }
        return (
          <div key={y}>
            <div className="mb-1.5 text-sm font-semibold">{y}</div>
            <div className="grid gap-[2px]" style={{ gridTemplateColumns: "26px repeat(31, minmax(0, 1fr))" }}>
              {MONTHS.map((label, m) => {
                const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
                return [
                  <div key={`l${m}`} className="pr-1 text-[9px] leading-[1] text-muted self-center">{label}</div>,
                  ...Array.from({ length: 31 }, (_, i) => {
                    const date = `${y}-${pad(m + 1)}-${pad(i + 1)}`;
                    if (i >= days) return <div key={date} />;
                    const e = byDate.get(date);
                    const color = e?.night ? colors.color(e.night.country) : undefined;
                    const transit = e && !e.night;
                    return (
                      <button
                        key={date}
                        onClick={() => setPicked(picked === date ? null : date)}
                        aria-label={`${date}: ${e?.night ? `${e.night.city}, ${countryName(e.night.country)}` : transit ? "in transit" : "not tracked"}`}
                        title={e?.night ? `${fmtDate(date)} · ${e.night.city}` : fmtDate(date)}
                        className={`aspect-square rounded-[2px] ${picked === date ? "ring-2 ring-fg ring-offset-1 ring-offset-panel-2" : ""}`}
                        style={color ? { background: color } : transit ? { boxShadow: "inset 0 0 0 1px #8b95a7" } : { background: "#1d2330" }}
                      />
                    );
                  }),
                ];
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
              {[...present].sort((a, b) => (a === colors.home ? -1 : b === colors.home ? 1 : 0)).map((c) => (
                <span key={c} className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-[2px]" style={{ background: colors.color(c) }} />
                  {countryName(c)}
                </span>
              ))}
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-[2px]" style={{ boxShadow: "inset 0 0 0 1px #8b95a7" }} />in transit</span>
            </div>
            {picked?.startsWith(`${y}-`) && <DayDetail date={picked} day={pickedDay} />}
          </div>
        );
      })}
      {years.length > 2 && (
        <button onClick={() => setShowAll(!showAll)} className="text-sm text-accent">{showAll ? "Show fewer years" : `Show ${years.length - 2} more ${years.length - 2 === 1 ? "year" : "years"}`}</button>
      )}
    </div>
  );
}

function DayDetail({ date, day }: { date: string; day: DayEntry | undefined }) {
  return (
    <div className="mt-3 rounded-xl bg-panel px-3 py-2 text-sm">
      <div className="font-medium">{new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</div>
      <div className="text-muted">
        {day?.night ? `${flagEmoji(day.night.country)} Slept in ${day.night.city.replace(" (city unknown)", "")}` : day ? "✈️ In transit overnight" : "Not tracked"}
        {day && day.touched.length > 1 && ` · also ${day.touched.filter((p) => p.key !== day.night?.key).map((p) => p.city.replace(" (city unknown)", "")).join(", ")}`}
      </div>
    </div>
  );
}
