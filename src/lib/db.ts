import "server-only";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { Checkin, Place, Trip } from "./types";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

declare global {
  var __tripDb: Database.Database | undefined;
}

function open(): Database.Database {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, "trip-recap.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mode TEXT NOT NULL,
      origin_name TEXT NOT NULL, origin_city TEXT NOT NULL, origin_country TEXT NOT NULL,
      origin_lat REAL NOT NULL, origin_lon REAL NOT NULL, origin_code TEXT,
      dest_name TEXT NOT NULL, dest_city TEXT NOT NULL, dest_country TEXT NOT NULL,
      dest_lat REAL NOT NULL, dest_lon REAL NOT NULL, dest_code TEXT,
      depart_date TEXT NOT NULL, depart_time TEXT,
      arrive_date TEXT NOT NULL, arrive_time TEXT,
      flight_number TEXT, airline TEXT, notes TEXT,
      distance_km REAL NOT NULL DEFAULT 0, duration_min INTEGER,
      source TEXT NOT NULL DEFAULT 'manual',
      external_id TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS trips_depart ON trips(depart_date);
    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL, time TEXT,
      lat REAL NOT NULL, lon REAL NOT NULL,
      city TEXT NOT NULL, country TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'shortcut',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS checkins_date ON checkins(date);
    CREATE TABLE IF NOT EXISTS trip_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS inbound_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      received_at TEXT NOT NULL DEFAULT (datetime('now')),
      from_addr TEXT, subject TEXT,
      status TEXT NOT NULL, -- added | duplicate | no-trip | unplaced | verification | error
      trips_added INTEGER NOT NULL DEFAULT 0,
      detail TEXT -- error message, or the body of a forwarding-confirmation email (it holds the code)
    );
    CREATE TABLE IF NOT EXISTS auto_dismissed (external_id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS gmail_messages (
      id TEXT PRIMARY KEY, subject TEXT, status TEXT NOT NULL, trips_added INTEGER NOT NULL DEFAULT 0,
      processed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // Migrations for databases created by earlier versions.
  const cols = (db.prepare("PRAGMA table_info(trips)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("group_id")) db.exec("ALTER TABLE trips ADD COLUMN group_id INTEGER REFERENCES trip_groups(id) ON DELETE SET NULL");
  return db;
}

export function db(): Database.Database {
  return (globalThis.__tripDb ??= open());
}

type Row = Record<string, unknown>;

function place(r: Row, p: "origin" | "dest"): Place {
  return {
    name: r[`${p}_name`] as string,
    city: r[`${p}_city`] as string,
    country: r[`${p}_country`] as string,
    lat: r[`${p}_lat`] as number,
    lon: r[`${p}_lon`] as number,
    code: (r[`${p}_code`] as string) ?? null,
  };
}

export function rowToTrip(r: Row): Trip {
  return {
    id: r.id as number,
    mode: r.mode as Trip["mode"],
    origin: place(r, "origin"),
    dest: place(r, "dest"),
    departDate: r.depart_date as string,
    departTime: (r.depart_time as string) ?? null,
    arriveDate: r.arrive_date as string,
    arriveTime: (r.arrive_time as string) ?? null,
    flightNumber: (r.flight_number as string) ?? null,
    airline: (r.airline as string) ?? null,
    notes: (r.notes as string) ?? null,
    distanceKm: r.distance_km as number,
    durationMin: (r.duration_min as number) ?? null,
    source: r.source as string,
    groupId: (r.group_id as number) ?? null,
  };
}

export function rowToCheckin(r: Row): Checkin {
  return {
    id: r.id as number,
    date: r.date as string,
    time: (r.time as string) ?? null,
    lat: r.lat as number,
    lon: r.lon as number,
    city: r.city as string,
    country: r.country as string,
    source: r.source as string,
  };
}

export function getSetting(key: string): string | null {
  const r = db().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return r?.value ?? null;
}

export function setSetting(key: string, value: string | null) {
  if (value == null) db().prepare("DELETE FROM settings WHERE key = ?").run(key);
  else db().prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}
