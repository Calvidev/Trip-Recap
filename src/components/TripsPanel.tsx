"use client";
import { MODE_META, fmtDate, fmtDuration, fmtKm, localToday } from "@/lib/format";
import { flagEmoji } from "@/lib/geo";
import type { Trip } from "@/lib/types";

export default function TripsPanel({ trips, onOpen }: { trips: Trip[]; onOpen: (t: Trip) => void }) {
  const today = localToday();
  if (!trips.length) {
    return (
      <div className="py-10 text-center text-muted">
        <div className="text-4xl mb-2">🗺️</div>
        No trips yet. Tap <span className="text-fg font-semibold">+</span> to log one, or import from Gmail in Settings.
      </div>
    );
  }
  const groups = new Map<string, Trip[]>();
  for (const t of trips) {
    const k = t.departDate.slice(0, 7);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }
  return (
    <div className="space-y-5">
      {[...groups].map(([month, list]) => (
        <section key={month}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            {fmtDate(`${month}-01`, { month: "long", year: "numeric" })}
          </h3>
          <ul className="space-y-2">
            {list.map((t) => {
              const m = MODE_META[t.mode];
              const upcoming = t.departDate > today;
              return (
                <li key={t.id}>
                  <button onClick={() => onOpen(t)} className="card w-full text-left hover:border-muted/50 transition">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg" style={{ background: `${m.color}22` }}>
                        {m.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 font-semibold">
                          <span className="truncate">
                            {t.origin.code ?? t.origin.city} <span className="text-muted">→</span> {t.dest.code ?? t.dest.city}
                          </span>
                          {upcoming && <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent">UPCOMING</span>}
                          {t.source === "gmail" && <span className="text-[10px] text-muted">via Gmail</span>}
                          {t.source === "auto" && <span className="rounded-full bg-drive/15 px-2 py-0.5 text-[10px] font-semibold text-drive">AUTO</span>}
                        </div>
                        <div className="truncate text-xs text-muted">
                          {flagEmoji(t.origin.country)} {t.origin.city} → {flagEmoji(t.dest.country)} {t.dest.city}
                        </div>
                      </div>
                      <div className="text-right text-xs">
                        <div className="text-fg">{fmtDate(t.departDate, { day: "numeric", month: "short" })}</div>
                        <div className="text-muted">{t.flightNumber ?? m.label}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-4 text-xs text-muted">
                      <span>{fmtKm(t.distanceKm)}</span>
                      <span>{fmtDuration(t.durationMin)}</span>
                      {t.departTime && <span>{t.departTime}{t.arriveTime ? ` – ${t.arriveTime}` : ""}{t.arriveDate !== t.departDate ? " (+1)" : ""}</span>}
                      {t.airline && <span className="truncate">{t.airline}</span>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
