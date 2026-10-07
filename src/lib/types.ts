export const MODES = ["flight", "train", "drive", "bus", "ferry"] as const;
export type Mode = (typeof MODES)[number];

export interface Place {
  name: string; // "Heathrow Airport" or "Lyon, France"
  city: string;
  country: string; // ISO 3166-1 alpha-2, e.g. "GB"
  lat: number;
  lon: number;
  code?: string | null; // IATA code for airports
}

export interface Trip {
  id: number;
  mode: Mode;
  origin: Place;
  dest: Place;
  departDate: string; // YYYY-MM-DD (local)
  departTime: string | null; // HH:MM (local)
  arriveDate: string;
  arriveTime: string | null;
  flightNumber: string | null;
  airline: string | null;
  notes: string | null;
  distanceKm: number;
  durationMin: number | null;
  source: "manual" | "gmail" | string;
  groupId: number | null;
  noGroup?: boolean; // you took it out of a group: auto-grouping leaves it alone
}

/** A named set of trips, e.g. "Europe 2026" (out, the legs in between, and back). */
export interface TripGroup {
  id: number;
  name: string;
}

export type TripInput = Omit<Trip, "id" | "distanceKm" | "source" | "groupId"> & {
  distanceKm?: number | null;
  source?: string;
  externalId?: string | null;
};

export interface Checkin {
  id: number;
  date: string; // YYYY-MM-DD local date of the night
  time: string | null; // HH:MM
  lat: number;
  lon: number;
  city: string;
  country: string; // ISO2
  source: "shortcut" | "manual" | string;
}
