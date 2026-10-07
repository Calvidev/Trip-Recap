import "server-only";
import PostalMime from "postal-mime";
import { db } from "./db";
import { tripsFromEmail } from "./email-trips";

export interface InboundLog {
  id: number;
  receivedAt: string;
  from: string | null;
  subject: string | null;
  status: "added" | "duplicate" | "no-trip" | "unplaced" | "verification" | "error";
  tripsAdded: number;
  detail: string | null;
}

// Gmail (and other providers) confirm a new forwarding address by mailing it a code.
const isForwardingConfirmation = (from: string, subject: string) =>
  /forwarding-noreply@google\.com/i.test(from) ||
  /(gmail forwarding confirmation|confirmación de reenvío|forwarding confirmation|confirm.*forward)/i.test(subject);

const MAX_PDF_BYTES = 8 * 1024 * 1024;

/** Handles one raw (RFC 822) email delivered by the Cloudflare Email Worker. */
export async function handleInboundEmail(raw: ArrayBuffer): Promise<InboundLog> {
  const log = db().prepare(
    "INSERT INTO inbound_emails (from_addr, subject, status, trips_added, detail) VALUES (?, ?, ?, ?, ?) RETURNING id, received_at",
  );
  let from = "", subject = "";
  const save = (status: InboundLog["status"], tripsAdded = 0, detail: string | null = null): InboundLog => {
    const r = log.get(from || null, subject || null, status, tripsAdded, detail) as { id: number; received_at: string };
    return { id: r.id, receivedAt: r.received_at, from: from || null, subject: subject || null, status, tripsAdded, detail };
  };
  try {
    const email = await PostalMime.parse(raw);
    from = email.from?.address ?? "";
    subject = email.subject ?? "";
    if (isForwardingConfirmation(from, subject)) {
      // Keep the body so you can copy the code / open the link from Settings.
      return save("verification", 0, (email.text || email.html?.replace(/<[^>]+>/g, " ") || "").slice(0, 3000));
    }
    const pdfs = (email.attachments ?? [])
      .filter((a) => a.mimeType === "application/pdf" && typeof a.content !== "string" && a.content.byteLength <= MAX_PDF_BYTES)
      .slice(0, 3)
      .map((a) => Buffer.from(a.content as ArrayBuffer).toString("base64"));
    const sent = email.date && !Number.isNaN(Date.parse(email.date)) ? new Date(email.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    const r = await tripsFromEmail({ subject, from, sentDate: sent, html: email.html ?? "", text: email.text ?? "", pdfs }, "email");
    if (r.added) return save("added", r.added);
    if (r.duplicates) return save("duplicate");
    if (r.unplaced) return save("unplaced", 0, "Found a trip but couldn't place its airports/cities.");
    return save("no-trip", 0, r.usedClaude ? null : "No structured booking data in this email. Set ANTHROPIC_API_KEY so Claude can read it.");
  } catch (e) {
    return save("error", 0, (e as Error).message.slice(0, 500));
  }
}

export function listInbound(limit = 20): InboundLog[] {
  return (db().prepare("SELECT * FROM inbound_emails ORDER BY id DESC LIMIT ?").all(limit) as Record<string, unknown>[]).map((r) => ({
    id: r.id as number,
    receivedAt: r.received_at as string,
    from: r.from_addr as string | null,
    subject: r.subject as string | null,
    status: r.status as InboundLog["status"],
    tripsAdded: r.trips_added as number,
    detail: r.detail as string | null,
  }));
}
