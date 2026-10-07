"use client";
import { useEffect, useState } from "react";
import PlaceInput from "./PlaceInput";
import { fmtDate, localToday } from "@/lib/format";
import { countryName, flagEmoji } from "@/lib/geo";
import { parseLocationCsv } from "@/lib/csv";
import type { Checkin, Place } from "@/lib/types";

interface GmailStatus { configured: boolean; connected: boolean; lastSync: string | null; claude: boolean }

export default function SettingsPanel({ checkins, onChanged, flash }: { checkins: Checkin[]; onChanged: () => void; flash?: string | null }) {
  return (
    <div className="space-y-4">
      {flash && <div className="card text-sm">{flash === "connected" ? "✅ Gmail connected. Hit “Sync now”." : `⚠️ Gmail: ${flash}`}</div>}
      <GmailCard onChanged={onChanged} />
      <ManualCheckin onChanged={onChanged} />
      <CsvImport onChanged={onChanged} />
      <ShortcutCard />
      <CheckinList checkins={checkins} onChanged={onChanged} />
      <div className="card text-sm">
        <div className="font-semibold mb-1">Backup</div>
        <a className="text-accent" href="/api/data" download="trip-recap.json">Download all data as JSON</a>
      </div>
    </div>
  );
}

function GmailCard({ onChanged }: { onChanged: () => void }) {
  const [s, setS] = useState<GmailStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const load = () => fetch("/api/gmail/status").then((r) => r.json()).then(setS);
  useEffect(() => { load(); }, []);

  async function sync() {
    setBusy(true);
    setMsg("Scanning your inbox… this can take a minute.");
    const r = await fetch("/api/gmail/sync", { method: "POST" }).then((r) => r.json());
    setBusy(false);
    setMsg(r.error ? `⚠️ ${r.error}` : `Scanned ${r.scanned} emails, added ${r.tripsAdded} trips.${r.errors?.length ? ` ${r.errors.length} errors (will retry).` : ""}`);
    load();
    onChanged();
  }
  async function disconnect() {
    await fetch("/api/gmail/status", { method: "DELETE" });
    load();
  }

  return (
    <div className="card space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <div className="font-semibold">📧 Import from Gmail</div>
        {s?.connected && <span className="text-xs text-drive">connected</span>}
      </div>
      {!s ? (
        <p className="text-muted">Loading…</p>
      ) : !s.configured ? (
        <p className="text-muted">Set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> on the server to enable this (see README).</p>
      ) : !s.connected ? (
        <a href="/api/gmail/connect" className="btn-primary w-full">Connect Gmail (read-only)</a>
      ) : (
        <>
          <p className="text-muted">
            Finds booking confirmations for flights, trains and buses. {s.claude ? "Emails without structured data are read by Claude." : "Only emails with airline structured data are parsed — set ANTHROPIC_API_KEY to read the rest."}
            {s.lastSync && <> Last sync {new Date(s.lastSync).toLocaleString()}.</>}
          </p>
          <div className="flex gap-2">
            <button onClick={sync} disabled={busy} className="btn-primary flex-1">{busy ? "Syncing…" : "Sync now"}</button>
            <button onClick={disconnect} className="btn-ghost">Disconnect</button>
          </div>
        </>
      )}
      {msg && <p className="text-muted">{msg}</p>}
    </div>
  );
}

function ManualCheckin({ onChanged }: { onChanged: () => void }) {
  const [place, setPlace] = useState<Place | null>(null);
  const [date, setDate] = useState(localToday());
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!place) return;
    setSaving(true);
    await fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: place.lat, lon: place.lon, city: place.city, country: place.country, date, source: "manual" }),
    });
    setSaving(false);
    setPlace(null);
    onChanged();
  }
  return (
    <div className="card space-y-3 text-sm">
      <div className="font-semibold">📍 I was here</div>
      <p className="text-muted">Fill gaps without a trip (e.g. you were already somewhere when you started logging). You stay there until your next trip or check-in.</p>
      <PlaceInput kind="place" value={place} onChange={setPlace} placeholder="City" />
      <div className="flex gap-2">
        <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        <button onClick={save} disabled={!place || saving} className="btn-primary">Add</button>
      </div>
    </div>
  );
}

function CsvImport({ onChanged }: { onChanged: () => void }) {
  const [msg, setMsg] = useState("");
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const { rows, skipped } = parseLocationCsv(await file.text());
    if (!rows.length) return setMsg("No rows found. Expected: date,lat,lon,city,country,countryCode,…");
    setMsg(`Importing ${rows.length} locations…`);
    const r = await fetch("/api/checkins/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rows),
    }).then((r) => r.json());
    setMsg(r.error ? "⚠️ Import failed." : `Added ${r.added} locations${r.duplicates ? `, ${r.duplicates} already there` : ""}${skipped ? `, ${skipped} lines skipped` : ""}.`);
    onChanged();
  }
  return (
    <div className="card space-y-2 text-sm">
      <div className="font-semibold">🗂️ Import location history</div>
      <p className="text-muted">
        Upload a CSV with one location per line: <code className="text-fg">date,lat,lon,city,country,countryCode</code> (extra columns are ignored). Works with the n8n <code className="text-fg">ubicaciones.csv</code>. Re-importing the same file won&apos;t create duplicates.
      </p>
      <label className="btn-ghost w-full cursor-pointer">
        Choose CSV file
        <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={onFile} />
      </label>
      {msg && <p className="text-muted">{msg}</p>}
    </div>
  );
}

function ShortcutCard() {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(location.origin), []);
  return (
    <div className="card space-y-2 text-sm">
      <div className="font-semibold">🌙 Nightly iPhone check-in</div>
      <p className="text-muted">
        A Shortcuts automation posts your location every night, so days per city are exact even without trips. Set it up once:
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-muted">
        <li>Shortcuts → Automation → <b>+</b> → <b>Time of Day</b> (e.g. 23:00, Daily) → <b>Run Immediately</b>.</li>
        <li>Add <b>Get Current Location</b>.</li>
        <li>Add <b>Get Contents of URL</b>: <code className="break-all text-fg">{origin}/api/checkin</code>, Method <b>POST</b>.</li>
        <li>Headers: <code className="text-fg">Authorization</code> = <code className="text-fg">Bearer YOUR_APP_TOKEN</code>.</li>
        <li>Request Body <b>JSON</b>: <code className="text-fg">latitude</code> = Current Location › Latitude, <code className="text-fg">longitude</code> = Current Location › Longitude, <code className="text-fg">date</code> = Current Date formatted <code className="text-fg">yyyy-MM-dd</code>.</li>
      </ol>
      <p className="text-muted">Full guide with screenshots-style steps: <code>docs/IPHONE_SHORTCUT.md</code>.</p>
    </div>
  );
}

function CheckinList({ checkins, onChanged }: { checkins: Checkin[]; onChanged: () => void }) {
  if (!checkins.length) return null;
  async function del(id: number) {
    await fetch(`/api/checkins/${id}`, { method: "DELETE" });
    onChanged();
  }
  return (
    <div className="card text-sm">
      <div className="mb-2 font-semibold">Recent check-ins</div>
      <ul className="divide-y divide-line">
        {checkins.slice(0, 30).map((c) => (
          <li key={c.id} className="flex items-center gap-2 py-2">
            <span>{flagEmoji(c.country)}</span>
            <span className="flex-1 truncate">{c.city}, {countryName(c.country)}</span>
            <span className="text-xs text-muted">{fmtDate(c.date, { day: "numeric", month: "short", year: "2-digit" })} · {c.source}</span>
            <button onClick={() => del(c.id)} className="px-1 text-muted hover:text-red-400" aria-label="Delete">×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
