"use client";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import { greatCircle, countryName } from "@/lib/geo";
import { MODE_META, fmtDate, fmtKm, tripLabel } from "@/lib/format";
import type { PlaceTotal } from "@/lib/stays";
import type { Trip } from "@/lib/types";

interface Props {
  trips: Trip[];
  cities: PlaceTotal[];
  selectedIds: number[] | null; // highlighted trips (one trip, or a group's legs)
  onSelect: (t: Trip) => void;
}

function linePoints(t: Trip): [number, number][] {
  if (t.mode === "flight") return greatCircle(t.origin.lat, t.origin.lon, t.dest.lat, t.dest.lon);
  // Ground trips: straight segment, longitude unwrapped for the rare date-line crossing.
  let lon2 = t.dest.lon;
  if (lon2 - t.origin.lon > 180) lon2 -= 360;
  if (lon2 - t.origin.lon < -180) lon2 += 360;
  return [[t.origin.lat, t.origin.lon], [t.dest.lat, lon2]];
}

function FitBounds({ trips, cities }: { trips: Trip[]; cities: PlaceTotal[] }) {
  const map = useMap();
  const key = trips.map((t) => t.id).join(",") + "|" + cities.length;
  useEffect(() => {
    const pts: [number, number][] = trips.flatMap((t) => [[t.origin.lat, t.origin.lon], [t.dest.lat, t.dest.lon]] as [number, number][]);
    cities.forEach((c) => pts.push([c.lat, c.lon]));
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 6, animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

// Free basemaps that need no API key. Esri's dark canvas is the default; if its
// tiles fail to load we fall back to OpenStreetMap, darkened with a CSS filter.
const BASEMAPS = [
  {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    labels: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors",
    className: "",
  },
  {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    labels: null,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    className: "osm-dark",
  },
];

function Basemap() {
  const [i, setI] = useState(0);
  const errors = useRef(0);
  const b = BASEMAPS[i];
  const onError = () => {
    if (++errors.current >= 4 && i < BASEMAPS.length - 1) {
      errors.current = 0;
      setI(i + 1);
    }
  };
  return (
    <>
      <TileLayer key={b.url} url={b.url} attribution={b.attribution} className={b.className} maxZoom={16} eventHandlers={{ tileerror: onError }} />
      {b.labels && <TileLayer key={b.labels} url={b.labels} maxZoom={16} />}
    </>
  );
}

export default function MapView({ trips, cities, selectedIds, onSelect }: Props) {
  const sel = useMemo(() => new Set(selectedIds ?? []), [selectedIds]);
  const lines = useMemo(() => trips.map((t) => ({ t, pts: linePoints(t) })), [trips]);
  const maxNights = Math.max(1, ...cities.map((c) => c.nights));

  return (
    <MapContainer
      center={[25, 0]}
      zoom={2}
      minZoom={2}
      worldCopyJump
      zoomControl={false}
      className="h-full w-full"
      attributionControl
    >
      <Basemap />
      <FitBounds trips={trips} cities={cities} />
      {lines.map(({ t, pts }) => {
        const m = MODE_META[t.mode];
        const on = sel.has(t.id);
        return (
          <Polyline
            key={t.id}
            positions={pts}
            pathOptions={{ color: m.color, weight: on ? 4 : 2, opacity: sel.size && !on ? 0.2 : 0.85, dashArray: m.dash }}
            eventHandlers={{ click: () => onSelect(t) }}
          >
            <Tooltip sticky>
              {m.icon} {tripLabel(t)} · {fmtDate(t.departDate)} · {fmtKm(t.distanceKm)}
            </Tooltip>
          </Polyline>
        );
      })}
      {cities.map((c) => (
        <CircleMarker
          key={c.key}
          center={[c.lat, c.lon]}
          radius={3 + 9 * Math.sqrt(c.nights / maxNights)}
          pathOptions={{ color: "#e8ecf3", weight: 1, fillColor: "#4f8cff", fillOpacity: 0.55 }}
        >
          <Popup>
            <div className="font-semibold">{c.label}</div>
            <div className="text-muted">{countryName(c.country)}</div>
            <div className="mt-1">
              {c.nights} nights · {c.days} days
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
