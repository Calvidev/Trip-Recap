"use client";
import { MODE_META, fmtDuration, fmtKm, localToday } from "@/lib/format";
import { countryName, flagEmoji } from "@/lib/geo";
import { cityLabel } from "./PlacesPanel";
import type { Trip, TripGroup } from "@/lib/types";

const SOURCE: Record<string, string> = {
  flighty: "Imported from Flighty",
  email: "Added from a forwarded email",
  gmail: "Imported from Gmail",
  manual: "Added by you",
  auto: "Detected from your check-ins. Date and mode are a guess; tap Edit to fix.",
  "auto-edited": "Detected from your check-ins, edited by you",
};

interface Props {
  trip: Trip;
  group: TripGroup | null;
  onEdit: () => void;
  onReturn: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function TripDetail({ trip: t, group, onEdit, onReturn, onDelete, onClose }: Props) {
  const m = MODE_META[t.mode];
  const from = cityLabel(t.origin.city), to = cityLabel(t.dest.city);
  const nextDay = t.arriveDate !== t.departDate;
  const upcoming = t.departDate > localToday();
  const fact = (label: string, value: string | null | undefined) =>
    value ? (
      <div className="rounded-xl bg-panel px-3 py-2">
        <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
        <div className="truncate font-medium">{value}</div>
      </div>
    ) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: `${m.color}26`, color: m.color }}>{m.icon} {m.label}</span>
        {upcoming && <span className="rounded-full bg-accent/20 px-2.5 py-1 text-xs font-semibold text-accent">Upcoming</span>}
        {t.source === "auto" && <span className="rounded-full bg-drive/15 px-2.5 py-1 text-xs font-semibold text-drive">Auto</span>}
        <button onClick={onClose} className="ml-auto grid h-9 w-9 place-items-center rounded-full bg-panel-2 text-xl text-muted" aria-label="Close">×</button>
      </div>

      {/* Route. Airport codes fit side by side; city names stack so long ones never get cut off. */}
      {t.origin.code && t.dest.code ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-4xl font-bold tracking-tight">{t.origin.code}</div>
            <div className="mt-0.5 truncate text-sm text-muted">{flagEmoji(t.origin.country)} {from.name}</div>
          </div>
          <div className="mt-3 shrink-0 text-xl text-muted">→</div>
          <div className="min-w-0 text-right">
            <div className="text-4xl font-bold tracking-tight">{t.dest.code}</div>
            <div className="mt-0.5 truncate text-sm text-muted">{flagEmoji(t.dest.country)} {to.name}</div>
          </div>
        </div>
      ) : (
        <div className="relative space-y-3 pl-6">
          <div className="absolute bottom-3 left-[7px] top-3 w-0.5 rounded-full" style={{ background: `${m.color}66` }} />
          {[{ c: from, p: t.origin }, { c: to, p: t.dest }].map(({ c, p }, i) => (
            <div key={i} className="relative">
              <span className="absolute -left-6 top-2 h-4 w-4 rounded-full border-2 bg-panel" style={{ borderColor: m.color }} />
              <div className="text-2xl font-bold leading-tight tracking-tight [overflow-wrap:anywhere]">{c.name}</div>
              <div className="text-sm text-muted">{flagEmoji(p.country)} {countryName(p.country)}{c.approx ? " · city unknown" : ""}</div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-line bg-panel-2 p-4">
        <div className="text-sm text-muted">{new Date(`${t.departDate}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</div>
        {t.departTime || t.arriveTime ? (
          <div className="mt-3 flex items-center gap-3">
            <div className="text-2xl font-semibold tabular-nums">{t.departTime ?? "—"}</div>
            <div className="relative flex-1">
              <div className="h-px w-full bg-line" />
              <div className="absolute inset-x-0 -top-2.5 text-center text-xs text-muted">{fmtDuration(t.durationMin)}</div>
            </div>
            <div className="text-2xl font-semibold tabular-nums">
              {t.arriveTime ?? "—"}
              {nextDay && <sup className="ml-0.5 text-xs text-muted">+{Math.round((Date.parse(t.arriveDate) - Date.parse(t.departDate)) / 86400000)}</sup>}
            </div>
          </div>
        ) : t.durationMin ? (
          <div className="mt-1 text-sm">about {fmtDuration(t.durationMin)}</div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        {fact("Distance", fmtKm(t.distanceKm))}
        {fact(t.mode === "flight" ? "Flight" : "Number", t.flightNumber)}
        {fact(t.mode === "flight" ? "Airline" : "Operator", t.airline)}
        {fact("Trip", group?.name)}
      </div>

      {t.notes && !t.notes.startsWith("Auto-detected") && <p className="text-sm text-muted">{t.notes}</p>}
      <p className="text-xs text-muted">{SOURCE[t.source] ?? ""}</p>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={onEdit} className="btn-primary">Edit</button>
        <button onClick={onReturn} className="btn-ghost">↩︎ Return trip</button>
      </div>
      <button
        onClick={() => confirm(t.source.startsWith("auto") ? "Delete this detected trip? It won't be detected again." : "Delete this trip?") && onDelete()}
        className="w-full py-2 text-sm text-red-300"
      >
        Delete trip
      </button>
    </div>
  );
}
