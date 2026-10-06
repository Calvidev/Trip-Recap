"use client";
import { MODE_META, fmtDuration, fmtKm, localToday, tripLabel } from "@/lib/format";
import { MODES, type Trip } from "@/lib/types";

const EARTH_KM = 40075;
const MOON_KM = 384400;

export default function StatsPanel({ trips }: { trips: Trip[] }) {
  const past = trips.filter((t) => t.departDate <= localToday());
  if (!past.length) return <p className="py-10 text-center text-muted">Stats appear after your first trip.</p>;

  const flights = past.filter((t) => t.mode === "flight");
  const totalKm = past.reduce((s, t) => s + t.distanceKm, 0);
  const flightKm = flights.reduce((s, t) => s + t.distanceKm, 0);
  const airMin = flights.reduce((s, t) => s + (t.durationMin ?? 0), 0);
  const airports = new Set(flights.flatMap((t) => [t.origin.code, t.dest.code]).filter(Boolean));
  const airlines = new Set(flights.map((t) => t.airline).filter(Boolean));
  const longest = [...flights].sort((a, b) => b.distanceKm - a.distanceKm)[0];
  const routes = count(flights.map((t) => [t.origin.code, t.dest.code].sort().join(" ⇄ ")));
  const topAirlines = count(flights.map((t) => t.airline ?? "").filter(Boolean));
  const topAirports = count(flights.flatMap((t) => [t.origin.code ?? "", t.dest.code ?? ""]).filter(Boolean));

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="text-xs uppercase tracking-wider text-muted">Total distance</div>
        <div className="text-3xl font-bold">{fmtKm(totalKm)}</div>
        <div className="text-sm text-muted">
          {(totalKm / EARTH_KM).toFixed(1)}× around the Earth · {((100 * totalKm) / MOON_KM).toFixed(1)}% to the Moon
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {MODES.map((m) => {
          const list = past.filter((t) => t.mode === m);
          if (!list.length) return null;
          return (
            <div key={m} className="card py-3">
              <div className="text-sm text-muted">{MODE_META[m].icon} {MODE_META[m].label}s</div>
              <div className="text-xl font-bold">{list.length}</div>
              <div className="text-xs text-muted">{fmtKm(list.reduce((s, t) => s + t.distanceKm, 0))}</div>
            </div>
          );
        })}
      </div>

      {flights.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Mini label="in the air" value={fmtDuration(airMin)} />
            <Mini label="airports" value={airports.size} />
            <Mini label="airlines" value={airlines.size} />
          </div>
          <div className="card text-sm space-y-1">
            <div className="text-xs uppercase tracking-wider text-muted">Flying</div>
            <Row k="Flight distance" v={fmtKm(flightKm)} />
            <Row k="Average flight" v={fmtKm(flightKm / flights.length)} />
            {longest && <Row k="Longest flight" v={`${tripLabel(longest)} · ${fmtKm(longest.distanceKm)}`} />}
          </div>
          <TopList title="Top routes" items={routes} />
          <TopList title="Top airports" items={topAirports} />
          <TopList title="Top airlines" items={topAirlines} />
        </>
      )}
    </div>
  );
}

function count(xs: string[]) {
  const m = new Map<string, number>();
  xs.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1));
  return [...m].sort((a, b) => b[1] - a[1]).slice(0, 5);
}
const Mini = ({ label, value }: { label: string; value: string | number }) => (
  <div className="card py-3">
    <div className="text-lg font-bold">{value}</div>
    <div className="text-[11px] text-muted">{label}</div>
  </div>
);
const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between gap-4"><span className="text-muted">{k}</span><span className="text-right">{v}</span></div>
);
function TopList({ title, items }: { title: string; items: [string, number][] }) {
  if (!items.length) return null;
  return (
    <div className="card text-sm space-y-1">
      <div className="text-xs uppercase tracking-wider text-muted">{title}</div>
      {items.map(([k, n]) => <Row key={k} k={k} v={`${n}×`} />)}
    </div>
  );
}
