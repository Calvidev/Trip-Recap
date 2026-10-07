"use client";
import { useEffect, useState } from "react";
import { fmtDate, localToday } from "@/lib/format";
import { countryName, flagEmoji } from "@/lib/geo";
import { parseLocationCsv } from "@/lib/csv";
import { isFlightyCsv } from "@/lib/flighty";
import type { Checkin, Trip } from "@/lib/types";

interface GmailStatus { configured: boolean; connected: boolean; lastSync: string | null; claude: boolean }

type Tone = "ok" | "warn" | "off";
const DOT: Record<Tone, string> = { ok: "bg-drive", warn: "bg-amber-400", off: "bg-muted/40" };
const daysAgo = (date: string) => Math.round((Date.parse(localToday()) - Date.parse(date)) / 86400000);
const ago = (date: string) => { const d = daysAgo(date); return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };

interface Props { checkins: Checkin[]; trips: Trip[]; onChanged: () => void; say: (msg: string) => void; flash?: string | null }

export default function SettingsPanel({ checkins, trips, onChanged, say, flash }: Props) {
  const [inbound, setInbound] = useState<{ address: string | null; emails: InboundLog[] } | null>(null);
  useEffect(() => {
    const load = () => fetch("/api/inbound-email").then((r) => r.json()).then(setInbound).catch(() => {});
    load();
    const t = setInterval(load, 15000); // new emails (and Gmail's code) show up while you're here
    return () => clearInterval(t);
  }, []);

  // Status of each automatic source, so you can tell at a glance that things are flowing.
  const lastNight = checkins.filter((c) => c.source === "shortcut").sort((a, b) => b.date.localeCompare(a.date))[0];
  const nightTone: Tone = !lastNight ? "off" : daysAgo(lastNight.date) <= 2 ? "ok" : "warn";
  const lastMail = inbound?.emails.find((e) => e.status !== "verification");
  const mailTone: Tone = !inbound?.emails.length ? "off" : lastMail?.status === "error" ? "warn" : "ok";
  const flighty = trips.filter((t) => t.source === "flighty").length;

  return (
    <div className="space-y-4">
      {flash && <div className="card text-sm">{flash === "connected" ? "✅ Gmail connected. Hit “Sync now”." : `⚠️ Gmail: ${flash}`}</div>}

      <section className="space-y-2">
        <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted">Sources · update on their own</h3>
        <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel-2">
          <Source
            icon="🌙" title="Nightly check-in" tone={nightTone}
            status={lastNight ? `Last ${ago(lastNight.date)} · ${lastNight.city}` : "Not set up yet"}
            hint={nightTone === "warn" ? "No check-in for a few days. Is the Shortcut automation still on?" : undefined}
          >
            <ShortcutSteps />
          </Source>
          <Source
            icon="📨" title="Email forwarding" tone={mailTone}
            status={lastMail ? `Last ${ago((lastMail.receivedAt ?? "").slice(0, 10))} · ${STATUS[lastMail.status]?.[1] ?? lastMail.status}` : inbound?.address ? `Forward bookings to ${inbound.address}` : "Not set up yet"}
            always={<VerificationCode emails={inbound?.emails ?? []} />}
          >
            <EmailLog data={inbound} />
          </Source>
          <Source icon="✈️" title="Flighty" tone={flighty ? "ok" : "off"} status={flighty ? `${flighty} flights imported` : "Import your Flighty export"}>
            <p className="text-sm text-muted">In Flighty: Settings → Export flights → share the CSV, then import it here. Importing again only adds new flights and updates times.</p>
          </Source>
        </div>
        <CsvImport onChanged={onChanged} say={say} />
      </section>

      <details className="group rounded-2xl border border-line bg-panel-2 [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium">
          Check-ins <span className="text-muted">{checkins.length} · <span className="inline-block transition group-open:rotate-90">›</span></span>
        </summary>
        <div className="px-4 pb-3"><CheckinList checkins={checkins} onChanged={onChanged} /></div>
      </details>

      <details className="group rounded-2xl border border-line bg-panel-2 [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium">
          Advanced <span className="inline-block text-muted transition group-open:rotate-90">›</span>
        </summary>
        <div className="space-y-3 px-4 pb-4">
          <GmailCard onChanged={onChanged} />
          <a className="block text-sm text-accent" href="/api/data" download="trip-recap.json">Download a backup of all data (JSON)</a>
        </div>
      </details>
    </div>
  );
}

function Source({ icon, title, status, tone, hint, always, children }: { icon: string; title: string; status: string; tone: Tone; hint?: string; always?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-4 py-3">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 text-left">
        <span className="text-xl">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 font-medium">{title}<span className={`h-2 w-2 rounded-full ${DOT[tone]}`} /></span>
          <span className="block truncate text-xs text-muted">{status}</span>
        </span>
        <span className="text-xs text-accent">{open ? "Hide" : "How it works"}</span>
      </button>
      {hint && <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{hint}</p>}
      {always}
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

interface InboundLog { id: number; receivedAt: string; from: string | null; subject: string | null; status: string; tripsAdded: number; detail: string | null }

const STATUS: Record<string, [string, string]> = {
  added: ["✅", "Trip added"],
  duplicate: ["☑️", "Already logged"],
  "no-trip": ["➖", "No trip found"],
  unplaced: ["⚠️", "Couldn't place airports"],
  verification: ["🔑", "Forwarding confirmation"],
  error: ["❌", "Error"],
};

function VerificationCode({ emails }: { emails: InboundLog[] }) {
  // Gmail's confirmation code is only useful for a little while after it arrives.
  const v = emails.find((e) => e.status === "verification" && Date.now() - Date.parse(e.receivedAt + "Z") < 2 * 86400000);
  if (!v) return null;
  const code = v.subject?.match(/#(\d{6,})/)?.[1] ?? v.detail?.match(/(?:code|código)\D{0,20}(\d{6,})/i)?.[1];
  const link = v.detail?.match(/https:\/\/mail(?:-settings)?\.google\.com\/\S+/)?.[0];
  return (
    <div className="mt-3 rounded-xl border border-accent/40 bg-accent/10 p-3 text-sm">
      <div className="font-semibold">🔑 Gmail confirmation code</div>
      {code ? <p className="mt-1 select-all font-mono text-lg">{code}</p> : <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-muted">{v.detail}</pre>}
      {link && <a href={link} target="_blank" rel="noreferrer noopener" className="mt-1 block truncate text-accent">Or open the confirmation link</a>}
    </div>
  );
}

function EmailLog({ data }: { data: { address: string | null; emails: InboundLog[] } | null }) {
  const emails = (data?.emails ?? []).filter((e) => e.status !== "verification").slice(0, 8);
  return (
    <div className="space-y-2 text-sm">
      <p className="text-muted">
        Forward booking emails to {data?.address ? <b className="text-fg">{data.address}</b> : "your Trip Recap address"}, or let a Gmail filter do it. Flights, trains and buses are added on their own, and ones you already have are skipped. Setup: <code>docs/EMAIL_FORWARDING.md</code>.
      </p>
      {emails.length ? (
        <ul className="divide-y divide-line">
          {emails.map((e) => (
            <li key={e.id} className="py-2">
              <div className="flex items-center gap-2">
                <span title={STATUS[e.status]?.[1]}>{STATUS[e.status]?.[0] ?? "•"}</span>
                <span className="min-w-0 flex-1 truncate">{e.subject || "(no subject)"}</span>
                <span className="shrink-0 text-xs text-muted">{new Date(e.receivedAt + "Z").toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
              </div>
              <div className="pl-6 text-xs text-muted">{STATUS[e.status]?.[1]}{e.detail && e.status !== "added" ? ` · ${e.detail}` : ""}</div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">No emails received yet.</p>
      )}
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
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <div className="font-semibold">📧 Search Gmail for past trips</div>
        {s?.connected && <span className="text-xs text-drive">connected</span>}
      </div>
      {!s ? (
        <p className="text-muted">Loading…</p>
      ) : !s.configured ? (
        <p className="text-muted">Searching your whole inbox needs a Google Cloud login set up on the server (see README). Email forwarding above is the simpler option.</p>
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

function CsvImport({ onChanged, say }: { onChanged: () => void; say: (msg: string) => void }) {
  const [busy, setBusy] = useState("");
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    const flighty = isFlightyCsv(text);
    if (!flighty && !parseLocationCsv(text).rows.length) return say("That file isn't a Flighty export or a location history");
    setBusy(flighty ? "Importing your flights…" : "Importing locations… (looking up places can take a minute)");
    const r = await fetch("/api/checkins/import", { method: "POST", headers: { "Content-Type": "text/csv" }, body: text }).then((r) => r.json()).catch(() => null);
    setBusy("");
    if (!r || r.error) return say("⚠️ Import failed");
    if (flighty) {
      const f = r.flighty;
      say(`✈️ ${f.added} new flights${f.updated ? `, ${f.updated} updated` : ""}${f.unknownAirports?.length ? ` · unknown: ${f.unknownAirports.join(", ")}` : ""}`);
    } else {
      say(`📍 ${r.added} new locations${r.autoTrips?.added ? ` · ${r.autoTrips.added} trips detected` : ""}`);
    }
    onChanged();
  }
  return (
    <label className={`btn-ghost w-full cursor-pointer ${busy ? "pointer-events-none opacity-70" : ""}`}>
      {busy || "⬆️ Import Flighty or location file"}
      <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={onFile} />
    </label>
  );
}

function ShortcutSteps() {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(location.origin), []);
  return (
    <div className="space-y-2 text-sm">
      <p className="text-muted">
        Every night your iPhone sends its location, so your days per city stay exact and trips are detected on their own. Set it up once:
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-muted">
        <li>Shortcuts → Automation → <b>+</b> → <b>Time of Day</b> (e.g. 23:00, Daily) → <b>Run Immediately</b>.</li>
        <li>Add <b>Get Current Location</b>.</li>
        <li>Add <b>Get Contents of URL</b>: <code className="break-all text-fg">{origin}/api/checkin</code>, Method <b>POST</b>.</li>
        <li>Headers: <code className="text-fg">Authorization</code> = <code className="text-fg">Bearer YOUR_APP_TOKEN</code>.</li>
        <li>Request Body <b>JSON</b>: <code className="text-fg">latitude</code> = Current Location › Latitude, <code className="text-fg">longitude</code> = Current Location › Longitude, <code className="text-fg">date</code> = Current Date formatted <code className="text-fg">yyyy-MM-dd</code>.</li>
      </ol>
      <p className="text-muted">Full guide: <code>docs/IPHONE_SHORTCUT.md</code>.</p>
    </div>
  );
}

function RepairUnknown({ count, onChanged }: { count: number; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function run() {
    setBusy(true);
    let total = 0;
    // Each call does up to ~90 lookups (about 1.5 min); repeat until done or stuck.
    for (let i = 0; i < 20; i++) {
      setMsg(`Looking up places… ${total} fixed so far`);
      const r = await fetch("/api/checkins/repair", { method: "POST" }).then((r) => r.json());
      total += r.fixed ?? 0;
      if (!r.remaining || !r.fixed) {
        setMsg(r.remaining ? `Fixed ${total}. ${r.remaining} couldn't be identified (no internet or the lookup service is down?).` : `Fixed ${total} places.`);
        break;
      }
    }
    setBusy(false);
    onChanged();
  }
  return (
    <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
      <p>{count} check-ins have an unknown city. Their coordinates are fine, so they can be looked up again.</p>
      <button onClick={run} disabled={busy} className="btn-primary mt-2 w-full">{busy ? "Fixing…" : `Fix ${count} unknown places`}</button>
      {msg && <p className="mt-2 text-muted">{msg}</p>}
    </div>
  );
}

function CheckinList({ checkins, onChanged }: { checkins: Checkin[]; onChanged: () => void }) {
  if (!checkins.length) return null;
  async function del(id: number) {
    await fetch(`/api/checkins/${id}`, { method: "DELETE" });
    onChanged();
  }
  const unknown = checkins.filter((c) => c.city === "Unknown" || c.country === "??").length;
  return (
    <div className="text-sm">
      {unknown > 0 && <RepairUnknown count={unknown} onChanged={onChanged} />}
      <ul className="divide-y divide-line">
        {checkins.slice(0, 20).map((c) => (
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
