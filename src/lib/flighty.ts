import { splitCsvLine } from "./csv.ts";

/** One row of a Flighty export (Settings → Export flights → CSV). Times are local to each airport. */
export interface FlightyFlight {
  flightyId: string;
  date: string;
  airline: string; // ICAO, e.g. "VIV"
  number: string;
  from: string; // IATA
  to: string;
  divertedTo: string | null;
  canceled: boolean;
  departure: string | null; // "YYYY-MM-DDTHH:MM" local
  arrival: string | null;
  aircraft: string;
  tail: string;
  seat: string;
  seatType: string;
  cabin: string;
  reason: string;
  notes: string;
}

export function isFlightyCsv(text: string): boolean {
  const head = text.slice(0, 500);
  return head.includes("Flight Flighty ID") || (head.startsWith("Date,Airline,Flight,From,To") && head.includes("Gate Departure"));
}

export function parseFlightyCsv(text: string): FlightyFlight[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const header = splitCsvLine(lines[0]);
  const col = (name: string) => header.indexOf(name);
  const get = (cells: string[], name: string) => {
    const i = col(name);
    return i >= 0 ? (cells[i] ?? "").trim() : "";
  };
  const first = (cells: string[], ...names: string[]) => names.map((n) => get(cells, n)).find((v) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v))?.slice(0, 16) ?? null;

  return lines.slice(1).map((line) => {
    const c = splitCsvLine(line);
    return {
      flightyId: get(c, "Flight Flighty ID") || `${get(c, "Date")}-${get(c, "Airline")}${get(c, "Flight")}-${get(c, "From")}`,
      date: get(c, "Date"),
      airline: get(c, "Airline"),
      number: get(c, "Flight"),
      from: get(c, "From").toUpperCase(),
      to: get(c, "To").toUpperCase(),
      divertedTo: get(c, "Diverted To").toUpperCase() || null,
      canceled: get(c, "Canceled").toLowerCase() === "true",
      // Prefer what actually happened, then the schedule, then runway times.
      departure: first(c, "Gate Departure (Actual)", "Gate Departure (Scheduled)", "Take off (Actual)", "Take off (Scheduled)"),
      arrival: first(c, "Gate Arrival (Actual)", "Gate Arrival (Scheduled)", "Landing (Actual)", "Landing (Scheduled)"),
      aircraft: get(c, "Aircraft Type Name"),
      tail: get(c, "Tail Number"),
      seat: get(c, "Seat"),
      seatType: get(c, "Seat Type"),
      cabin: get(c, "Cabin Class"),
      reason: get(c, "Flight Reason"),
      notes: get(c, "Notes"),
    };
  }).filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f.date) && f.from && f.to);
}
