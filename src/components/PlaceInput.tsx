"use client";
import { useEffect, useRef, useState } from "react";
import { flagEmoji } from "@/lib/geo";
import type { Place } from "@/lib/types";

interface Props {
  kind: "airport" | "place";
  value: Place | null;
  onChange: (p: Place | null) => void;
  placeholder?: string;
}

/** Autocomplete for airports (local IATA database) or any place (OpenStreetMap). */
export default function PlaceInput({ kind, value, onChange, placeholder }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const s = q.trim();
    if (s.length < (kind === "airport" ? 2 : 3)) {
      setResults([]);
      return;
    }
    const n = ++seq.current;
    const h = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/${kind === "airport" ? "airports" : "geocode"}?q=${encodeURIComponent(s)}`);
        const data = await res.json();
        if (n === seq.current) setResults(Array.isArray(data) ? data : []);
      } finally {
        if (n === seq.current) setLoading(false);
      }
    }, kind === "airport" ? 120 : 450);
    return () => clearTimeout(h);
  }, [q, kind]);

  if (value) {
    return (
      <button type="button" onClick={() => { onChange(null); setQ(""); }} className="input flex items-center gap-2 text-left">
        <span>{flagEmoji(value.country)}</span>
        {value.code && <span className="font-mono font-semibold">{value.code}</span>}
        <span className="truncate">{value.code ? value.city : value.name}</span>
        <span className="ml-auto text-muted text-xs">change</span>
      </button>
    );
  }

  return (
    <div className="relative">
      <input
        className="input"
        value={q}
        placeholder={placeholder ?? (kind === "airport" ? "Code or city (e.g. MEX, Madrid)" : "City, station or address")}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (results.length > 0 || loading) && (
        <ul className="absolute z-[1100] mt-1 w-full max-h-64 overflow-auto rounded-xl border border-line bg-panel shadow-2xl">
          {loading && !results.length && <li className="px-3 py-2 text-sm text-muted">Searching…</li>}
          {results.map((p, i) => (
            <li key={`${p.code ?? ""}${p.lat},${p.lon},${i}`}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-panel-2"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange(p); setOpen(false); }}
              >
                <span>{flagEmoji(p.country)}</span>
                {p.code && <span className="w-10 font-mono font-semibold">{p.code}</span>}
                <span className="truncate">{p.code ? `${p.city} · ${p.name}` : p.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
