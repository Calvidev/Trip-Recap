"use client";
import { useState } from "react";
import PlaceInput from "./PlaceInput";
import { MODE_META, localToday } from "@/lib/format";
import { MODES, type Mode, type Place, type Trip } from "@/lib/types";

interface Props {
  initial?: Partial<Trip> | null;
  onSaved: () => void;
  onClose: () => void;
}

export default function TripForm({ initial, onSaved, onClose }: Props) {
  const editing = Boolean(initial?.id);
  const [mode, setMode] = useState<Mode>(initial?.mode ?? "flight");
  const [origin, setOrigin] = useState<Place | null>(initial?.origin ?? null);
  const [dest, setDest] = useState<Place | null>(initial?.dest ?? null);
  const [departDate, setDepartDate] = useState(initial?.departDate ?? localToday());
  const [departTime, setDepartTime] = useState(initial?.departTime ?? "");
  const [arriveDate, setArriveDate] = useState(initial?.arriveDate ?? "");
  const [arriveTime, setArriveTime] = useState(initial?.arriveTime ?? "");
  const [number, setNumber] = useState(initial?.flightNumber ?? "");
  const [carrier, setCarrier] = useState(initial?.airline ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isFlight = mode === "flight";
  // Changing the mode keeps From/To. A flight can start or end at a city; tap
  // the place to swap in a specific airport if you want one.
  const switchMode = (m: Mode) => setMode(m);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!origin || !dest) return setError("Pick where you left from and where you arrived.");
    if (arriveDate && arriveDate < departDate) return setError("Arrival can't be before departure.");
    setSaving(true);
    setError("");
    const body = {
      mode, origin, dest, departDate,
      departTime: departTime || null,
      arriveDate: arriveDate || null,
      arriveTime: arriveTime || null,
      flightNumber: number || null,
      airline: carrier || null,
      notes: notes || null,
    };
    const res = await fetch(editing ? `/api/trips/${initial!.id}` : "/api/trips", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) return setError("Couldn't save — check the fields.");
    onSaved();
  }

  async function remove() {
    if (!confirm("Delete this trip?")) return;
    await fetch(`/api/trips/${initial!.id}`, { method: "DELETE" });
    onSaved();
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{editing ? "Edit trip" : "Add a trip"}</h2>
        <button type="button" onClick={onClose} className="text-muted text-2xl leading-none px-2" aria-label="Close">×</button>
      </div>

      <div className="grid grid-cols-5 gap-1 rounded-xl bg-panel-2 p-1 border border-line">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            className={`rounded-lg py-2 text-xs font-medium ${mode === m ? "bg-fg text-bg" : "text-muted"}`}
          >
            <div className="text-base">{MODE_META[m].icon}</div>
            {MODE_META[m].label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {isFlight && editing && (!origin?.code || !dest?.code) && (
          <p className="text-xs text-muted">Optional: tap From or To to pick the exact airport.</p>
        )}
        <div>
          <label className="label">From</label>
          <PlaceInput kind={isFlight ? "airport" : "place"} value={origin} onChange={setOrigin} />
        </div>
        <div>
          <label className="label">To</label>
          <PlaceInput kind={isFlight ? "airport" : "place"} value={dest} onChange={setDest} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Departs</label>
          <input type="date" className="input" value={departDate} onChange={(e) => setDepartDate(e.target.value)} required />
        </div>
        <div>
          <label className="label">Time (local)</label>
          <input type="time" className="input" value={departTime} onChange={(e) => setDepartTime(e.target.value)} />
        </div>
        <div>
          <label className="label">Arrives</label>
          <input type="date" className="input" value={arriveDate} min={departDate} placeholder="same day" onChange={(e) => setArriveDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Time (local)</label>
          <input type="time" className="input" value={arriveTime} onChange={(e) => setArriveTime(e.target.value)} />
        </div>
      </div>
      <p className="-mt-2 text-xs text-muted">Leave arrival date empty for same-day arrival. Overnight trips count the night as “in transit”.</p>

      {mode !== "drive" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{isFlight ? "Flight #" : "Number"}</label>
            <input className="input" value={number} onChange={(e) => setNumber(e.target.value)} placeholder={isFlight ? "AM 1" : "AVE 3100"} />
          </div>
          <div>
            <label className="label">{isFlight ? "Airline" : "Operator"}</label>
            <input className="input" value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder={isFlight ? "Aeroméxico" : "Renfe"} />
          </div>
        </div>
      )}

      <div>
        <label className="label">Notes</label>
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Seat, who you travelled with…" />
      </div>

      {initial?.source === "auto" && (
        <p className="rounded-xl border border-drive/30 bg-drive/10 p-3 text-xs text-muted">
          Detected from your nightly check-ins and assumed to be by {initial.mode === "flight" ? "plane (too far to drive overnight)" : "car"}. Fix anything that&apos;s wrong and save. Edited trips stay as you leave them, and deleted ones won&apos;t come back.
        </p>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-2 pt-1">
        {editing && <button type="button" onClick={remove} className="btn-danger">Delete</button>}
        <button className="btn-primary flex-1" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Add trip"}</button>
      </div>
    </form>
  );
}
