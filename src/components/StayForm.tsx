"use client";
import { useState } from "react";
import PlaceInput from "./PlaceInput";
import { localToday } from "@/lib/format";
import type { Place } from "@/lib/types";

/** "I was here": a manual check-in. You stay there until your next trip or check-in. */
export default function StayForm({ onSaved }: { onSaved: () => void }) {
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
    onSaved();
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        For a night the check-in missed, or where you already were when you started logging. You count as there from this date until your next trip or check-in, and trips get detected around it.
      </p>
      <div>
        <label className="label">Where</label>
        <PlaceInput kind="place" value={place} onChange={setPlace} placeholder="City" />
      </div>
      <div>
        <label className="label">From</label>
        <input type="date" className="input" value={date} max={localToday()} onChange={(e) => setDate(e.target.value)} />
      </div>
      <button onClick={save} disabled={!place || saving} className="btn-primary w-full">{saving ? "Saving…" : "Add stay"}</button>
    </div>
  );
}
