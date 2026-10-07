"use client";
import { useState } from "react";
import { MODE_META, fmtDate, fmtDuration, fmtKm, localToday } from "@/lib/format";
import { flagEmoji } from "@/lib/geo";
import type { Trip, TripGroup } from "@/lib/types";

interface Props {
  trips: Trip[];
  groups: TripGroup[];
  onOpen: (t: Trip) => void;
  onChanged: () => void;
  /** Highlight these trips on the map (an expanded group), or clear with null. */
  onFocus: (tripIds: number[] | null) => void;
}

type Item = { kind: "trip"; date: string; trip: Trip } | { kind: "group"; date: string; group: TripGroup; legs: Trip[] };

export default function TripsPanel({ trips, groups, onOpen, onChanged, onFocus }: Props) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState<number | null>(null);
  const [naming, setNaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  if (!trips.length) {
    return (
      <div className="py-10 text-center text-muted">
        <div className="text-4xl mb-2">🗺️</div>
        No trips yet. Tap <span className="text-fg font-semibold">+</span> to log one, or import from Gmail in Settings.
      </div>
    );
  }

  // Build list items: each group is one card dated by its first leg; ungrouped trips stay single.
  const byGroup = new Map<number, Trip[]>();
  const items: Item[] = [];
  for (const t of trips) {
    if (t.groupId != null && groups.some((g) => g.id === t.groupId)) {
      if (!byGroup.has(t.groupId)) byGroup.set(t.groupId, []);
      byGroup.get(t.groupId)!.push(t);
    } else items.push({ kind: "trip", date: t.departDate, trip: t });
  }
  for (const g of groups) {
    const legs = (byGroup.get(g.id) ?? []).sort((a, b) => a.departDate.localeCompare(b.departDate) || (a.departTime ?? "").localeCompare(b.departTime ?? ""));
    if (legs.length) items.push({ kind: "group", date: legs[0].departDate, group: g, legs });
  }
  items.sort((a, b) => b.date.localeCompare(a.date));
  const months = new Map<string, Item[]>();
  for (const it of items) {
    const k = it.date.slice(0, 7);
    if (!months.has(k)) months.set(k, []);
    months.get(k)!.push(it);
  }

  const toggle = (id: number) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelected(s);
  };
  const stopSelecting = () => { setSelecting(false); setSelected(new Set()); setNaming(false); };
  const tap = (t: Trip) => (selecting ? toggle(t.id) : onOpen(t));

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    setBusy(false);
    onChanged();
  }
  async function groupSelected(name: string | null, existing?: TripGroup) {
    const ids = [...selected];
    if (existing) await call(`/api/groups/${existing.id}`, "PATCH", { addTripIds: ids });
    else if (name) await call("/api/groups", "POST", { name, tripIds: ids });
    stopSelecting();
  }
  async function autoGroup() {
    setBusy(true);
    setMsg("");
    const r = await fetch(`/api/groups/auto?today=${localToday()}`, { method: "POST" }).then((r) => r.json());
    setBusy(false);
    setMsg(r.created?.length ? `Created ${r.created.length} groups. Rename or ungroup any of them from the group card.` : "No new journeys found. Trips that leave home and come back get grouped; trips you already grouped are left alone.");
    onChanged();
  }
  function toggleGroup(g: TripGroup, legs: Trip[]) {
    const next = open === g.id ? null : g.id;
    setOpen(next);
    onFocus(next == null ? null : legs.map((l) => l.id));
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        {selecting ? (
          <>
            <span className="self-center text-sm text-muted">{selected.size ? `${selected.size} selected` : "Tap trips to select"}</span>
            <button onClick={stopSelecting} className="chip ml-auto">Cancel</button>
          </>
        ) : (
          <>
            <button onClick={() => setSelecting(true)} className="chip">Select</button>
            <button onClick={autoGroup} disabled={busy} className="chip">{busy ? "Grouping…" : "✨ Auto-group"}</button>
          </>
        )}
      </div>
      {msg && <p className="-mt-2 text-xs text-muted">{msg}</p>}

      {[...months].map(([month, list]) => (
        <section key={month}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            {fmtDate(`${month}-01`, { month: "long", year: "numeric" })}
          </h3>
          <ul className="space-y-2">
            {list.map((it) =>
              it.kind === "trip" ? (
                <li key={`t${it.trip.id}`}>
                  <TripRow t={it.trip} onTap={tap} selecting={selecting} checked={selected.has(it.trip.id)} />
                </li>
              ) : (
                <li key={`g${it.group.id}`}>
                  <GroupCard
                    group={it.group}
                    legs={it.legs}
                    open={open === it.group.id}
                    onToggle={() => toggleGroup(it.group, it.legs)}
                    onTapLeg={tap}
                    selecting={selecting}
                    selected={selected}
                    onRename={() => {
                      const name = prompt("Group name", it.group.name)?.trim();
                      if (name) call(`/api/groups/${it.group.id}`, "PATCH", { name });
                    }}
                    onUngroup={() => {
                      if (confirm(`Ungroup "${it.group.name}"? The trips stay.`)) {
                        onFocus(null);
                        call(`/api/groups/${it.group.id}`, "DELETE");
                      }
                    }}
                  />
                </li>
              ),
            )}
          </ul>
        </section>
      ))}

      {selecting && selected.size > 0 && (
        <div className="sticky bottom-0 -mx-4 border-t border-line bg-panel px-4 py-3">
          {naming ? (
            <NameGroup
              trips={trips.filter((t) => selected.has(t.id))}
              groups={groups}
              busy={busy}
              onCreate={(name) => groupSelected(name)}
              onAddTo={(g) => groupSelected(null, g)}
              onRemove={async () => {
                const ids = [...selected];
                await call(`/api/groups/0`, "PATCH", { removeTripIds: ids });
                stopSelecting();
              }}
              onBack={() => setNaming(false)}
            />
          ) : (
            <button onClick={() => setNaming(true)} className="btn-primary w-full">Group {selected.size} {selected.size === 1 ? "trip" : "trips"}</button>
          )}
        </div>
      )}
    </div>
  );
}

function TripRow({ t, onTap, selecting, checked, compact }: { t: Trip; onTap: (t: Trip) => void; selecting: boolean; checked: boolean; compact?: boolean }) {
  const m = MODE_META[t.mode];
  const upcoming = t.departDate > localToday();
  return (
    <button onClick={() => onTap(t)} className={`card w-full text-left transition hover:border-muted/50 ${compact ? "p-3" : ""} ${checked ? "border-accent bg-accent/10" : ""}`}>
      <div className="flex items-center gap-3">
        {selecting && (
          <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] ${checked ? "border-accent bg-accent text-white" : "border-muted"}`}>{checked ? "✓" : ""}</span>
        )}
        <div className={`grid shrink-0 place-items-center rounded-xl ${compact ? "h-8 w-8 text-base" : "h-10 w-10 text-lg"}`} style={{ background: `${m.color}22` }}>
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
          {!compact && (
            <div className="truncate text-xs text-muted">
              {flagEmoji(t.origin.country)} {t.origin.city} → {flagEmoji(t.dest.country)} {t.dest.city}
            </div>
          )}
        </div>
        <div className="text-right text-xs">
          <div className="text-fg">{fmtDate(t.departDate, { day: "numeric", month: "short" })}</div>
          <div className="text-muted">{t.flightNumber ?? m.label}</div>
        </div>
      </div>
      {!compact && (
        <div className="mt-3 flex gap-4 text-xs text-muted">
          <span>{fmtKm(t.distanceKm)}</span>
          <span>{fmtDuration(t.durationMin)}</span>
          {t.departTime && <span>{t.departTime}{t.arriveTime ? ` – ${t.arriveTime}` : ""}{t.arriveDate !== t.departDate ? " (+1)" : ""}</span>}
          {t.airline && <span className="truncate">{t.airline}</span>}
        </div>
      )}
    </button>
  );
}

interface GroupCardProps {
  group: TripGroup;
  legs: Trip[];
  open: boolean;
  onToggle: () => void;
  onTapLeg: (t: Trip) => void;
  selecting: boolean;
  selected: Set<number>;
  onRename: () => void;
  onUngroup: () => void;
}

function GroupCard({ group, legs, open, onToggle, onTapLeg, selecting, selected, onRename, onUngroup }: GroupCardProps) {
  const first = legs[0], last = legs[legs.length - 1];
  const km = legs.reduce((s, t) => s + t.distanceKm, 0);
  const flags = [...new Set(legs.flatMap((t) => [t.origin.country, t.dest.country]))];
  const days = Math.round((Date.parse(last.arriveDate) - Date.parse(first.departDate)) / 86400000) + 1;
  return (
    <div className={`rounded-2xl border bg-panel-2 ${open ? "border-accent/60" : "border-line"}`}>
      <button onClick={onToggle} className="w-full p-4 text-left">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-lg">🧳</div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{group.name}</div>
            <div className="truncate text-xs text-muted">
              {fmtDate(first.departDate, { day: "numeric", month: "short" })} – {fmtDate(last.arriveDate, { day: "numeric", month: "short", year: "numeric" })} · {days} {days === 1 ? "day" : "days"}
            </div>
          </div>
          <span className={`text-muted transition ${open ? "rotate-90" : ""}`}>›</span>
        </div>
        <div className="mt-3 flex items-center gap-4 text-xs text-muted">
          <span>{legs.length} {legs.length === 1 ? "leg" : "legs"}</span>
          <span>{fmtKm(km)}</span>
          <span className="truncate">{flags.map(flagEmoji).join(" ")}</span>
        </div>
      </button>
      {open && (
        <div className="space-y-2 border-t border-line p-3">
          {legs.map((t) => (
            <TripRow key={t.id} t={t} onTap={onTapLeg} selecting={selecting} checked={selected.has(t.id)} compact />
          ))}
          {!selecting && (
            <div className="flex gap-2 pt-1">
              <button onClick={onRename} className="btn-ghost flex-1">Rename</button>
              <button onClick={onUngroup} className="btn-ghost flex-1">Ungroup</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NameGroup({ trips, groups, busy, onCreate, onAddTo, onRemove, onBack }: {
  trips: Trip[]; groups: TripGroup[]; busy: boolean;
  onCreate: (name: string) => void; onAddTo: (g: TripGroup) => void; onRemove: () => void; onBack: () => void;
}) {
  const sorted = [...trips].sort((a, b) => a.departDate.localeCompare(b.departDate));
  const month = sorted[0] ? fmtDate(sorted[0].departDate, { month: "short", year: "numeric" }) : "";
  const dests = [...new Set(sorted.map((t) => t.dest.city))].slice(0, 2).join(" & ");
  const [name, setName] = useState(`${dests} · ${month}`);
  const inGroup = trips.some((t) => t.groupId != null);
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name, e.g. Europe 2026" autoFocus />
        <button disabled={busy || !name.trim()} onClick={() => onCreate(name)} className="btn-primary">Create</button>
      </div>
      {groups.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="self-center text-xs text-muted">or add to</span>
          {groups.slice(-6).reverse().map((g) => (
            <button key={g.id} disabled={busy} onClick={() => onAddTo(g)} className="chip max-w-[60%] truncate">{g.name}</button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={onBack} className="btn-ghost flex-1">Back</button>
        {inGroup && <button onClick={onRemove} disabled={busy} className="btn-ghost flex-1">Remove from group</button>}
      </div>
    </div>
  );
}
