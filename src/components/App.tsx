"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import TripForm from "./TripForm";
import TripsPanel from "./TripsPanel";
import PlacesPanel from "./PlacesPanel";
import StatsPanel from "./StatsPanel";
import SettingsPanel from "./SettingsPanel";
import { buildDayLog, totals } from "@/lib/stays";
import { localToday } from "@/lib/format";
import type { Checkin, Trip } from "@/lib/types";

const MapView = dynamic(() => import("./MapView"), { ssr: false, loading: () => <div className="h-full w-full bg-bg" /> });

type Tab = "trips" | "places" | "stats" | "settings";
const TABS: { id: Tab; label: string }[] = [
  { id: "trips", label: "Trips" },
  { id: "places", label: "Places" },
  { id: "stats", label: "Stats" },
  { id: "settings", label: "Settings" },
];

export default function App() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [year, setYear] = useState<number | "all">("all");
  const [tab, setTab] = useState<Tab>("trips");
  const [editing, setEditing] = useState<Partial<Trip> | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/data", { cache: "no-store" });
    if (r.ok) {
      const d = await r.json();
      setTrips(d.trips);
      setCheckins(d.checkins);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
    const p = new URLSearchParams(location.search);
    if (p.get("tab") === "settings") setTab("settings");
    if (p.get("gmail")) setFlash(p.get("gmail"));
    if (p.size) history.replaceState(null, "", "/");
  }, [load]);

  const today = localToday();
  const log = useMemo(() => buildDayLog(trips, checkins, today), [trips, checkins, today]);
  const years = useMemo(() => {
    const ys = new Set<number>([...trips.map((t) => +t.departDate.slice(0, 4)), ...log.map((d) => +d.date.slice(0, 4))]);
    return [...ys].sort((a, b) => b - a);
  }, [trips, log]);
  const range: [string, string] = year === "all" ? ["0000-01-01", "9999-12-31"] : [`${year}-01-01`, `${year}-12-31`];
  const tot = useMemo(() => totals(log, range[0], range[1]), [log, range[0], range[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  const visibleTrips = useMemo(() => trips.filter((t) => t.departDate >= range[0] && t.departDate <= range[1]), [trips, range[0], range[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  const saved = () => { setEditing(null); load(); };
  const open = (t: Trip) => { setSelectedId(t.id); setEditing(t); };

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* Map */}
      <div className="absolute inset-0 md:left-[440px]">
        <MapView trips={visibleTrips} cities={tot.cities} selectedId={selectedId} onSelect={open} />
      </div>

      {/* Top bar: year filter */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] md:left-[440px]" style={{ paddingTop: "max(env(safe-area-inset-top), 12px)" }}>
        <div className="pointer-events-auto flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
          <button onClick={() => setYear("all")} className={`chip ${year === "all" ? "chip-on" : ""}`}>All time</button>
          {years.map((y) => (
            <button key={y} onClick={() => setYear(y)} className={`chip ${year === y ? "chip-on" : ""}`}>{y}</button>
          ))}
        </div>
      </div>

      {/* Sheet (bottom on phones, sidebar on desktop) */}
      <section
        className={`absolute inset-x-0 bottom-0 z-[1000] flex flex-col rounded-t-3xl border-t border-line bg-panel/95 backdrop-blur-xl transition-[height] duration-300
          md:inset-y-0 md:left-0 md:right-auto md:h-auto md:w-[440px] md:rounded-none md:border-r md:border-t-0
          ${expanded ? "h-[62dvh]" : "h-[150px]"}`}
      >
        <button onClick={() => setExpanded(!expanded)} className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-line md:hidden" aria-label="Resize panel" />
        <header className="flex items-center gap-3 px-4 pt-3 md:pt-6">
          <h1 className="text-xl font-bold tracking-tight">Trip Recap</h1>
          <span className="text-sm text-muted">
            {visibleTrips.length} trips · {tot.countries.length} countries
          </span>
        </header>
        <nav className="flex gap-1 px-4 pt-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setExpanded(true); }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium ${tab === t.id ? "bg-panel-2 text-fg" : "text-muted"}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="flex-1 overflow-y-auto px-4 pb-28 pt-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 96px)" }}>
          {!loaded ? (
            <p className="text-muted">Loading…</p>
          ) : tab === "trips" ? (
            <TripsPanel trips={visibleTrips} onOpen={open} />
          ) : tab === "places" ? (
            <PlacesPanel totals={tot} log={log} isAllTime={year === "all"} />
          ) : tab === "stats" ? (
            <StatsPanel trips={visibleTrips} />
          ) : (
            <SettingsPanel checkins={checkins} onChanged={load} flash={flash} />
          )}
        </div>
      </section>

      {/* Add button */}
      <button
        onClick={() => { setSelectedId(null); setEditing({}); }}
        className="absolute right-5 z-[1001] grid h-14 w-14 place-items-center rounded-full bg-accent text-3xl font-light text-white shadow-[0_8px_30px_rgba(79,140,255,0.45)] active:scale-95 md:left-[372px] md:right-auto"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
        aria-label="Add trip"
      >
        +
      </button>

      {/* Add / edit sheet */}
      {editing && (
        <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/60 md:items-center" onClick={() => { setEditing(null); setSelectedId(null); }}>
          <div
            className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-line bg-panel p-5 md:max-w-lg md:rounded-3xl"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <TripForm key={editing.id ?? "new"} initial={editing} onSaved={saved} onClose={() => { setEditing(null); setSelectedId(null); }} />
            {editing.id && (
              <button
                className="btn-ghost mt-2 w-full"
                onClick={() =>
                  setEditing({
                    mode: editing.mode, origin: editing.dest, dest: editing.origin, airline: editing.airline,
                    departDate: editing.arriveDate ?? editing.departDate,
                  })
                }
              >
                ↩︎ Log the return trip
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
