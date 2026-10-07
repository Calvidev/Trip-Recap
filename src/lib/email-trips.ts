import "server-only";
import { refreshDerived } from "./refresh";
import { airport } from "./airports";
import { geocode } from "./geocode";
import { claudeEnabled, extractFromJsonLd, extractWithClaude, type Segment } from "./extract";
import { createTrip, findSameFlight, type TripPayload } from "./trips";
import { replaceGuessesWithRealFlights } from "./autotrips";

import type { Place } from "./types";

/** Booking emails → trips. Shared by email forwarding and the Gmail API import. */

export const htmlToText = (h: string) =>
  h.replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

async function resolvePlace(code: string | null, city: string | null): Promise<Place | null> {
  const a = airport(code);
  if (a) return { name: a.name, city: a.city, country: a.country, lat: a.lat, lon: a.lon, code: a.code };
  if (!city) return null;
  const [g] = await geocode(city, 1).catch(() => []);
  return g ?? null;
}

async function segmentToTrip(s: Segment, source: string): Promise<TripPayload | null> {
  const [origin, dest] = [await resolvePlace(s.fromCode, s.fromCity), await resolvePlace(s.toCode, s.toCity)];
  if (!origin || !dest || !/^\d{4}-\d{2}-\d{2}$/.test(s.departDate)) return null;
  const hhmm = (t: string | null) => (t && /^\d{1,2}:\d{2}/.test(t) ? t.slice(0, 5).padStart(5, "0") : null);
  const key = [s.mode, (s.flightNumber ?? "").replace(/\s+/g, ""), s.departDate, origin.code ?? origin.city, dest.code ?? dest.city].join(":");
  return {
    mode: s.mode,
    origin, dest,
    departDate: s.departDate, departTime: hhmm(s.departTime),
    arriveDate: s.arriveDate && /^\d{4}-\d{2}-\d{2}$/.test(s.arriveDate) ? s.arriveDate : null,
    arriveTime: hhmm(s.arriveTime),
    flightNumber: s.flightNumber, airline: s.airline,
    source,
    // One id per leg whatever email it came from: confirmation, change and boarding-pass emails don't duplicate.
    externalId: `mail:${key}`.toLowerCase(),
  };
}

export interface EmailInput {
  subject: string;
  from: string;
  sentDate: string; // YYYY-MM-DD, lets Claude resolve dates printed without a year
  html: string;
  text: string;
  pdfs?: string[]; // base64 PDF attachments
}

export interface EmailResult {
  segments: number; // legs found in the email
  added: number;
  duplicates: number; // already logged (from Flighty, an earlier email, by hand)
  unplaced: number; // legs whose airports/cities couldn't be found
  usedClaude: boolean;
}

export async function tripsFromEmail(mail: EmailInput, source: string): Promise<EmailResult> {
  let segs = extractFromJsonLd(mail.html);
  let usedClaude = false;
  if (!segs.length && claudeEnabled()) {
    usedClaude = true;
    segs = await extractWithClaude(mail.subject, mail.from, mail.sentDate, mail.text || htmlToText(mail.html), mail.pdfs);
  }
  const res: EmailResult = { segments: segs.length, added: 0, duplicates: 0, unplaced: 0, usedClaude };
  for (const s of segs) {
    const trip = await segmentToTrip(s, source);
    if (!trip) res.unplaced++;
    else if (findSameFlight(trip) || !createTrip(trip)) res.duplicates++;
    else res.added++;
  }
  if (res.added) {
    replaceGuessesWithRealFlights();
    refreshDerived();
  }
  return res;
}
