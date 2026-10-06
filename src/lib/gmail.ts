import "server-only";
import { getSetting, setSetting, db } from "./db";
import { claudeEnabled, extractFromJsonLd, extractWithClaude, type Segment } from "./extract";
import { airport } from "./airports";
import { geocode } from "./geocode";
import { createTrip, type TripPayload } from "./trips";
import type { Place } from "./types";

// Gmail via plain REST + OAuth (read-only scope). Create an OAuth client
// ("Web application") in Google Cloud Console, enable the Gmail API, and add
// <APP_URL>/api/gmail/callback as an authorised redirect URI.
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export const gmailConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const gmailConnected = () => Boolean(getSetting("gmail_refresh_token"));
const redirectUri = (origin: string) => `${process.env.APP_URL || origin}/api/gmail/callback`;

export function authUrl(origin: string, state: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...body }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google OAuth: ${json.error_description || json.error || res.status}`);
  return json as { access_token: string; refresh_token?: string };
}

export async function exchangeCode(code: string, origin: string) {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri(origin) });
  if (!t.refresh_token) throw new Error("Google didn't return a refresh token; remove the app at myaccount.google.com/permissions and connect again.");
  setSetting("gmail_refresh_token", t.refresh_token);
}

export function disconnect() {
  setSetting("gmail_refresh_token", null);
}

async function gmail<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Gmail API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

interface Part { mimeType: string; body?: { data?: string }; parts?: Part[]; headers?: { name: string; value: string }[] }
const b64 = (s = "") => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
function collect(p: Part, acc: { html: string; text: string }) {
  if (p.mimeType === "text/html" && p.body?.data) acc.html += b64(p.body.data);
  else if (p.mimeType === "text/plain" && p.body?.data) acc.text += b64(p.body.data);
  p.parts?.forEach((c) => collect(c, acc));
  return acc;
}
const htmlToText = (h: string) =>
  h.replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

// Subjects airlines / OTAs / rail operators typically use.
const QUERY =
  '{subject:itinerary subject:"flight confirmation" subject:"booking confirmation" subject:"boarding pass" subject:"e-ticket" subject:"eticket" subject:"your trip" subject:"your flight" subject:"reservation" subject:"confirmación" subject:"itinerario" subject:"reserva" subject:"pase de abordar" subject:"tarjeta de embarque" subject:"train ticket" subject:"billet"} -in:spam -in:trash';

async function resolvePlace(code: string | null, city: string | null): Promise<Place | null> {
  const a = airport(code);
  if (a) return { name: a.name, city: a.city, country: a.country, lat: a.lat, lon: a.lon, code: a.code };
  if (!city) return null;
  const [g] = await geocode(city, 1).catch(() => []);
  return g ?? null;
}

async function segmentToTrip(s: Segment): Promise<TripPayload | null> {
  const [origin, dest] = [await resolvePlace(s.fromCode, s.fromCity), await resolvePlace(s.toCode, s.toCity)];
  if (!origin || !dest || !/^\d{4}-\d{2}-\d{2}$/.test(s.departDate)) return null;
  const hhmm = (t: string | null) => (t && /^\d{1,2}:\d{2}/.test(t) ? t.slice(0, 5).padStart(5, "0") : null);
  const key = [s.mode, s.flightNumber ?? "", s.departDate, origin.code ?? origin.city, dest.code ?? dest.city].join(":");
  return {
    mode: s.mode,
    origin, dest,
    departDate: s.departDate, departTime: hhmm(s.departTime),
    arriveDate: s.arriveDate && /^\d{4}-\d{2}-\d{2}$/.test(s.arriveDate) ? s.arriveDate : null,
    arriveTime: hhmm(s.arriveTime),
    flightNumber: s.flightNumber, airline: s.airline,
    source: "gmail",
    externalId: `gmail:${key}`.toLowerCase(),
  };
}

export interface SyncResult { scanned: number; tripsAdded: number; skipped: number; errors: string[]; usedClaude: boolean }

export async function syncGmail({ maxMessages = 100, newerThan = "3y" } = {}): Promise<SyncResult> {
  const refresh = getSetting("gmail_refresh_token");
  if (!refresh) throw new Error("Gmail is not connected");
  const { access_token } = await tokenRequest({ refresh_token: refresh, grant_type: "refresh_token" });

  const done = db().prepare("SELECT 1 FROM gmail_messages WHERE id = ?");
  const mark = db().prepare("INSERT OR REPLACE INTO gmail_messages (id, subject, status, trips_added) VALUES (?, ?, ?, ?)");
  const result: SyncResult = { scanned: 0, tripsAdded: 0, skipped: 0, errors: [], usedClaude: claudeEnabled() };

  let pageToken: string | undefined;
  const ids: string[] = [];
  do {
    const q = encodeURIComponent(`${QUERY} newer_than:${newerThan}`);
    const page = await gmail<{ messages?: { id: string }[]; nextPageToken?: string }>(
      access_token, `/messages?q=${q}&maxResults=100${pageToken ? `&pageToken=${pageToken}` : ""}`);
    for (const m of page.messages ?? []) if (!done.get(m.id)) ids.push(m.id);
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < maxMessages);

  for (const id of ids.slice(0, maxMessages)) {
    result.scanned++;
    let subject = "";
    try {
      const msg = await gmail<{ payload: Part; internalDate: string }>(access_token, `/messages/${id}?format=full`);
      const h = (n: string) => msg.payload.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? "";
      subject = h("subject");
      const { html, text } = collect(msg.payload, { html: "", text: "" });
      let segs = extractFromJsonLd(html);
      if (!segs.length && claudeEnabled()) {
        const sent = new Date(Number(msg.internalDate)).toISOString().slice(0, 10);
        segs = await extractWithClaude(subject, h("from"), sent, text || htmlToText(html));
      }
      let added = 0;
      for (const s of segs) {
        const trip = await segmentToTrip(s);
        if (trip && createTrip(trip)) added++;
      }
      result.tripsAdded += added;
      if (!segs.length) result.skipped++;
      mark.run(id, subject, segs.length ? "parsed" : "no-trip", added);
    } catch (e) {
      // Leave unmarked so the next sync retries it.
      result.errors.push(`${subject || id}: ${(e as Error).message}`);
    }
  }
  setSetting("gmail_last_sync", new Date().toISOString());
  return result;
}
