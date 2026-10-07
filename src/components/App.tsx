"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TripForm from "./TripForm";
import TripDetail from "./TripDetail";
import StayForm from "./StayForm";
import { cityLabel } from "./PlacesPanel";
import TripsPanel from "./TripsPanel";
import PlacesPanel from "./PlacesPanel";
import StatsPanel from "./StatsPanel";
import SettingsPanel from "./SettingsPanel";
import { buildDayLog, totals } from "@/lib/stays";
import { fmtDate, localToday } from "@/lib/format";
import { flagEmoji } from "@/lib/geo";
import type { Checkin, Trip, TripGroup } from "@/lib/types";

const MapView = dynamic(() => import("./MapView"), { ssr: false, loading: () => <div className="h-full w-full bg-bg" /> });

type Tab = "trips" | "places" | "stats" | "settings";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "trips", label: "Trips", icon: "✈️" },
  { id: "places", label: "Places", icon: "📍" },
  { id: "stats", label: "Stats", icon: "📊" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

type Snap = "peek" | "half" | "full";
const PEEK = 150; // handle + title + tabs

/** Bottom-sheet heights for the current phone screen. */
function useSheetHeights() {
  const [vh, setVh] = useState(800);
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => { setVh(window.innerHeight); setDesktop(mq.matches); };
    update();
    window.addEventListener("resize", update);
    mq.addEventListener("change", update);
    return () => { window.removeEventListener("resize", update); mq.removeEventListener("change", update); };
  }, []);
  return { desktop, heights: { peek: PEEK, half: Math.round(vh * 0.52), full: vh - 64 } as Record<Snap, number>, vh };
}

export default function App() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [groups, setGroups] = useState<TripGroup[]>([]);
  const [focusIds, setFocusIds] = useState<number[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [year, setYear] = useState<number | "all">("all");
  const [tab, setTab] = useState<Tab>("trips");
  const [editing, setEditing] = useState<Partial<Trip> | null>(null);
  const [viewing, setViewing] = useState<Trip | null>(null);
  const [addMode, setAddMode] = useState<"trip" | "stay">("trip");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const { desktop, heights, vh } = useSheetHeights();
  const [snap, setSnap] = useState<Snap>("half");
  const [dragH, setDragH] = useState<number | null>(null);
  const drag = useRef<{ y: number; h: number; t: number; moved: boolean } | null>(null);
  const sheetH = dragH ?? heights[snap];

  const load = useCallback(async () => {
    const r = await fetch("/api/data", { cache: "no-store" });
    if (r.ok) {
      const d = await r.json();
      setTrips(d.trips);
      setCheckins(d.checkins);
      setGroups(d.groups ?? []);
    }
    setLoaded(true);
  }, []);

  // Stay current on its own: new check-ins, forwarded emails, auto-detected trips.
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    const t = setInterval(() => document.visibilityState === "visible" && load(), 60000);
    return () => { document.removeEventListener("visibilitychange", onVisible); clearInterval(t); };
  }, [load]);

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

  // Where you are now: the latest stay (all time), e.g. "Livonia 🇺🇸 since Sep 28".
  const allTot = useMemo(() => totals(log), [log]);
  const lastDay = log[log.length - 1];
  const now = lastDay?.night ? allTot.stays[0] : null;

  const saved = (msg = "Saved") => { setEditing(null); setViewing(null); setSelectedId(null); load(); say(msg); };
  const open = (t: Trip) => { setSelectedId(t.id); setViewing(t); if (snap === "full") setSnap("half"); };
  const add = () => { setSelectedId(null); setViewing(null); setAddMode("trip"); setEditing({}); };
  const closeSheets = () => { setEditing(null); setViewing(null); setSelectedId(null); };
  async function deleteTrip(t: Trip) {
    await fetch(`/api/trips/${t.id}`, { method: "DELETE" });
    saved("Trip deleted");
  }

  // ----- sheet dragging (phones) -----
  function onPointerDown(e: React.PointerEvent) {
    if (desktop || (e.target as HTMLElement).closest("button[data-nodrag]")) return;
    drag.current = { y: e.clientY, h: sheetH, t: Date.now(), moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dy = d.y - e.clientY;
    if (Math.abs(dy) > 4) d.moved = true;
    if (d.moved) setDragH(Math.max(PEEK - 40, Math.min(heights.full + 20, d.h + dy)));
  }
  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      // A tap on the handle area cycles the sizes.
      setSnap(snap === "peek" ? "half" : snap === "half" ? "full" : "half");
      return;
    }
    const h = d.h + (d.y - e.clientY);
    const v = (d.y - e.clientY) / Math.max(1, Date.now() - d.t); // px/ms, + = up
    let next: Snap;
    if (v > 0.5) next = h > heights.half ? "full" : "half";
    else if (v < -0.5) next = h < heights.half ? "peek" : "half";
    else next = (["peek", "half", "full"] as Snap[]).reduce((a, b) => (Math.abs(heights[b] - h) < Math.abs(heights[a] - h) ? b : a));
    setSnap(next);
    setDragH(null);
  }

  const chooseTab = (t: Tab) => {
    setTab(t);
    if (snap === "peek") setSnap("half");
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-bg">
      {/* Map */}
      <div className="absolute inset-0 md:left-[440px]">
        <MapView
          trips={visibleTrips}
          cities={tot.cities}
          selectedIds={selectedId != null ? [selectedId] : focusIds}
          onSelect={open}
          bottomInset={desktop ? 0 : viewing && !editing ? Math.round(vh * 0.72) : Math.min(sheetH, heights.half)}
        />
      </div>

      {/* Year filter over the map */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 md:left-[440px]" style={{ paddingTop: "max(env(safe-area-inset-top), 12px)" }}>
        <div className="pointer-events-auto flex gap-2 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
          <button onClick={() => setYear("all")} className={`chip ${year === "all" ? "chip-on" : ""}`}>All time</button>
          {years.map((y) => (
            <button key={y} onClick={() => setYear(y)} className={`chip ${year === y ? "chip-on" : ""}`}>{y}</button>
          ))}
        </div>
      </div>

      {/* Sheet: draggable on phones, sidebar on desktop */}
      <section
        className="absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[28px] border-t border-line/80 bg-panel/95 shadow-[0_-12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl md:inset-y-0 md:left-0 md:right-auto md:w-[440px] md:rounded-none md:border-r md:border-t-0 md:shadow-none"
        style={desktop ? undefined : { height: sheetH, transition: dragH == null ? "height 260ms cubic-bezier(.2,.8,.2,1)" : "none" }}
      >
        <div
          className="shrink-0 cursor-grab touch-none select-none md:cursor-auto md:touch-auto"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="mx-auto mt-2.5 h-1.5 w-11 rounded-full bg-muted/40 md:hidden" />
          <header className="flex items-center gap-3 px-4 pt-3 md:pt-6">
            <div className="min-w-0 flex-1">
              <h1 className="text-[22px] font-bold leading-tight tracking-tight">Trip Recap</h1>
              <p className="truncate text-[13px] text-muted">
                {now ? (
                  <>📍 {cityLabel(now.place.city).name} {flagEmoji(now.place.country)} <span className="opacity-70">since {fmtDate(now.from, { day: "numeric", month: "short" })}</span></>
                ) : lastDay ? "✈️ In transit" : `${visibleTrips.length} trips`}
                <span className="opacity-70"> · {tot.countries.length} countries</span>
              </p>
            </div>
            <button
              data-nodrag
              onClick={add}
              className="flex h-10 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold text-white shadow-[0_6px_20px_rgba(79,140,255,0.4)] active:scale-95"
              aria-label="Add trip"
            >
              <span className="text-xl leading-none">+</span> Add
            </button>
          </header>
          <nav className="mx-4 mt-3 grid grid-cols-4 gap-1 rounded-2xl bg-panel-2 p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                data-nodrag
                onClick={() => chooseTab(t.id)}
                className={`flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[12px] font-medium transition ${tab === t.id ? "bg-fg text-bg" : "text-muted"}`}
              >
                <span className="text-base leading-none">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {/* min-h-0 is what lets this flex child scroll (iOS couldn't scroll the list before). */}
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 [-webkit-overflow-scrolling:touch]"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 28px)" }}
        >
          {!loaded ? (
            <div className="space-y-3" aria-label="Loading">
              {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-panel-2" style={{ animationDelay: `${i * 120}ms` }} />)}
            </div>
          ) : tab === "trips" ? (
            <TripsPanel trips={visibleTrips} groups={groups} onOpen={open} onChanged={() => { load(); say("Groups updated"); }} onFocus={(ids) => { setFocusIds(ids); if (ids && snap === "full") setSnap("half"); }} />
          ) : tab === "places" ? (
            <PlacesPanel totals={tot} log={log} year={year} />
          ) : tab === "stats" ? (
            <StatsPanel trips={visibleTrips} />
          ) : (
            <SettingsPanel checkins={checkins} trips={trips} onChanged={load} say={say} flash={flash} />
          )}
        </div>
      </section>

      {/* Trip detail: the map behind it shows the route */}
      {viewing && !editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center md:items-start md:justify-end md:p-6 md:pt-20" onClick={closeSheets}>
          <div
            className="w-full overflow-y-auto overscroll-contain rounded-t-[28px] border border-line bg-panel p-5 shadow-[0_-12px_40px_rgba(0,0,0,0.5)] md:max-w-sm md:rounded-3xl"
            style={{ maxHeight: desktop ? "92dvh" : vh * 0.72, paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <TripDetail
              trip={viewing}
              group={groups.find((g) => g.id === viewing.groupId) ?? null}
              onClose={closeSheets}
              onEdit={() => setEditing(viewing)}
              onReturn={() => {
                setViewing(null);
                setEditing({ mode: viewing.mode, origin: viewing.dest, dest: viewing.origin, airline: viewing.airline, departDate: viewing.arriveDate ?? viewing.departDate });
              }}
              onDelete={() => deleteTrip(viewing)}
            />
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4" style={{ top: "calc(max(env(safe-area-inset-top), 12px) + 52px)" }}>
          <div className="rounded-full border border-line bg-panel-2/95 px-4 py-2 text-sm font-medium shadow-lg backdrop-blur">{toast}</div>
        </div>
      )}

      {/* Add / edit sheet */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:items-center" onClick={closeSheets}>
          <div
            className="w-full overflow-y-auto overscroll-contain rounded-t-[28px] border border-line bg-panel p-5 md:max-w-lg md:rounded-3xl"
            style={{ maxHeight: desktop ? "92dvh" : vh - 40, paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* A brand-new entry can be a trip or a stay ("I was here") */}
            {!editing.id && !editing.origin && (
              <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-line bg-panel-2 p-1">
                {([["trip", "✈️ Trip"], ["stay", "📍 I was here"]] as const).map(([m, label]) => (
                  <button key={m} onClick={() => setAddMode(m)} className={`rounded-lg py-2 text-sm font-medium ${addMode === m ? "bg-fg text-bg" : "text-muted"}`}>{label}</button>
                ))}
              </div>
            )}
            {addMode === "stay" && !editing.id && !editing.origin ? (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Add a stay</h2>
                  <button onClick={closeSheets} className="px-2 text-2xl leading-none text-muted" aria-label="Close">×</button>
                </div>
                <StayForm onSaved={() => saved("Stay added")} />
              </>
            ) : (
              <TripForm key={editing.id ?? "new"} initial={editing} onSaved={() => saved(editing.id ? "Trip updated" : "Trip added")} onClose={() => (viewing ? setEditing(null) : closeSheets())} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
