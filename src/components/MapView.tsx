"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, StyleSpecification } from "maplibre-gl";

// Worker copied into /public at build time (scripts/copy-maplibre-worker.mjs).
if (typeof window !== "undefined") maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
import { useEffect, useMemo, useRef, useState } from "react";
import { countryName, greatCircle, haversineKm } from "@/lib/geo";
import { MODE_META, fmtDate, fmtKm, tripLabel } from "@/lib/format";
import type { PlaceTotal } from "@/lib/stays";
import type { Trip } from "@/lib/types";

interface Props {
  trips: Trip[];
  cities: PlaceTotal[];
  selectedIds: number[] | null; // highlighted trips (one trip, or a group's legs)
  onSelect: (t: Trip) => void;
  bottomInset?: number; // px covered by the bottom sheet, so the map centres in the visible part
}

// ---------- basemaps (no API keys) ----------
// A dark vector style on OpenFreeMap's free OpenMapTiles planet; Esri's dark raster
// canvas is the fallback if those tiles can't load.
const OFM = "https://tiles.openfreemap.org";
const C = { space: "#04060b", ocean: "#0a1322", land: "#16213a", border: "#2f3e5f", label: "#8391ad", city: "#b3bdd0", glow: "#2b5fb3" };

// Globe atmosphere: a blue rim when zoomed out, fading away as you zoom in.
const sky: StyleSpecification["sky"] = {
  "sky-color": C.space,
  "horizon-color": C.glow,
  "fog-color": C.space,
  "sky-horizon-blend": 0.6,
  "horizon-fog-blend": 0.8,
  "fog-ground-blend": 0.9,
  "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 4, 0.6, 7, 0],
};

// Built-in Natural Earth outlines (generated into /public at build time) so the
// globe always shows continents; detailed vector tiles from OpenFreeMap load on top.
const baseSources: StyleSpecification["sources"] = {
  land: { type: "geojson", data: "/world-land.geojson" },
  borders: { type: "geojson", data: "/world-borders.geojson" },
};
const baseLayers: StyleSpecification["layers"] = [
  { id: "ocean", type: "background", paint: { "background-color": C.ocean } },
  { id: "land", type: "fill", source: "land", paint: { "fill-color": C.land } },
  { id: "land-borders", type: "line", source: "borders", maxzoom: 3.5, paint: { "line-color": C.border, "line-width": 0.6 } },
];

const vectorStyle: StyleSpecification = {
  version: 8,
  sky,
  glyphs: `${OFM}/fonts/{fontstack}/{range}.pbf`,
  sources: { ...baseSources, omt: { type: "vector", url: `${OFM}/planet` } },
  layers: [
    ...baseLayers,
    // Detailed coastlines/lakes from the tiles refine the coarse built-in land.
    { id: "water", type: "fill", source: "omt", "source-layer": "water", minzoom: 3, paint: { "fill-color": C.ocean } },
    { id: "ice", type: "fill", source: "omt", "source-layer": "landcover", minzoom: 3, filter: ["==", ["get", "class"], "ice"], paint: { "fill-color": "#1c2944", "fill-opacity": 0.6 } },
    {
      id: "countries", type: "line", source: "omt", "source-layer": "boundary", minzoom: 3.5,
      filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]],
      paint: { "line-color": C.border, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.6, 8, 1.4] },
    },
    {
      id: "states", type: "line", source: "omt", "source-layer": "boundary", minzoom: 4,
      filter: ["all", ["==", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]],
      paint: { "line-color": C.border, "line-width": 0.5, "line-dasharray": [2, 2] },
    },
    {
      id: "country-labels", type: "symbol", source: "omt", "source-layer": "place", minzoom: 1.5, maxzoom: 6,
      filter: ["==", ["get", "class"], "country"],
      layout: {
        "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
        "text-font": ["Noto Sans Regular"], "text-size": ["interpolate", ["linear"], ["zoom"], 1.5, 9, 5, 13],
        "text-transform": "uppercase", "text-letter-spacing": 0.12, "text-max-width": 7,
      },
      paint: { "text-color": C.label, "text-halo-color": C.ocean, "text-halo-width": 1 },
    },
    {
      id: "city-labels", type: "symbol", source: "omt", "source-layer": "place", minzoom: 4.5,
      filter: ["==", ["get", "class"], "city"],
      layout: { "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]], "text-font": ["Noto Sans Regular"], "text-size": 11 },
      paint: { "text-color": C.city, "text-halo-color": C.ocean, "text-halo-width": 1 },
    },
  ],
};

// Used if OpenFreeMap is unreachable: built-in outlines only (still a full globe).
const offlineStyle: StyleSpecification = { version: 8, sky, glyphs: `${OFM}/fonts/{fontstack}/{range}.pbf`, sources: baseSources, layers: baseLayers };

// ---------- data → GeoJSON ----------
function linePoints(t: Trip): [number, number][] {
  if (t.mode === "flight") return greatCircle(t.origin.lat, t.origin.lon, t.dest.lat, t.dest.lon).map(([la, lo]) => [lo, la]);
  let lon2 = t.dest.lon;
  if (lon2 - t.origin.lon > 180) lon2 -= 360;
  if (lon2 - t.origin.lon < -180) lon2 += 360;
  return [[t.origin.lon, t.origin.lat], [lon2, t.dest.lat]];
}

function tripsGeo(trips: Trip[], sel: Set<number>): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: trips.map((t) => ({
      type: "Feature",
      id: t.id,
      properties: { id: t.id, color: MODE_META[t.mode].color, ground: t.mode !== "flight", on: sel.has(t.id), dim: sel.size > 0 && !sel.has(t.id) },
      geometry: { type: "LineString", coordinates: linePoints(t) },
    })),
  };
}

function citiesGeo(cities: PlaceTotal[]): GeoJSON.FeatureCollection {
  const max = Math.max(1, ...cities.map((c) => c.nights));
  return {
    type: "FeatureCollection",
    features: cities.map((c) => ({
      type: "Feature",
      properties: { key: c.key, label: c.label, country: c.country, nights: c.nights, days: c.days, r: 3 + 9 * Math.sqrt(c.nights / max) },
      geometry: { type: "Point", coordinates: [c.lon, c.lat] },
    })),
  };
}

function addOverlay(map: maplibregl.Map) {
  if (map.getSource("trips")) return;
  map.addSource("trips", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addSource("cities", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  const opacity = (on: number, off: number, base: number): maplibregl.ExpressionSpecification => ["case", ["get", "on"], on, ["get", "dim"], off, base];
  map.addLayer({ id: "trips-glow", type: "line", source: "trips", layout: { "line-cap": "round" },
    paint: { "line-color": ["get", "color"], "line-width": ["case", ["get", "on"], 12, 7], "line-blur": 6, "line-opacity": opacity(0.55, 0.03, 0.25) } });
  map.addLayer({ id: "trips-air", type: "line", source: "trips", filter: ["!", ["get", "ground"]], layout: { "line-cap": "round" },
    paint: { "line-color": ["get", "color"], "line-width": ["case", ["get", "on"], 3.5, 2], "line-opacity": opacity(1, 0.15, 0.95) } });
  map.addLayer({ id: "trips-ground", type: "line", source: "trips", filter: ["get", "ground"], layout: { "line-cap": "round" },
    paint: { "line-color": ["get", "color"], "line-width": ["case", ["get", "on"], 3, 1.8], "line-dasharray": [1.5, 2], "line-opacity": opacity(1, 0.15, 0.9) } });
  // Wide invisible line so thin arcs are easy to tap on a phone.
  map.addLayer({ id: "trips-hit", type: "line", source: "trips", paint: { "line-color": "#000", "line-width": 18, "line-opacity": 0 } });
  map.addLayer({ id: "cities-halo", type: "circle", source: "cities",
    paint: { "circle-radius": ["*", ["get", "r"], 2.2], "circle-color": "#4f8cff", "circle-opacity": 0.12, "circle-blur": 0.8 } });
  map.addLayer({ id: "cities", type: "circle", source: "cities",
    paint: { "circle-radius": ["get", "r"], "circle-color": "#4f8cff", "circle-opacity": 0.85, "circle-stroke-color": "#e8ecf3", "circle-stroke-width": 1.2 } });
  map.addLayer({ id: "cities-label", type: "symbol", source: "cities", minzoom: 2.5,
    layout: { "text-field": ["get", "label"], "text-font": ["Noto Sans Regular"], "text-size": 11, "text-offset": [0, 1.3], "text-anchor": "top", "text-optional": true },
    paint: { "text-color": "#e8ecf3", "text-halo-color": C.ocean, "text-halo-width": 1.2 } });
}

export default function MapView({ trips, cities, selectedIds, onSelect, bottomInset = 0 }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(0); // bumps on each (re)loaded style
  const [globe, setGlobe] = useState(true);
  const globeRef = useRef(globe);
  globeRef.current = globe;
  const sel =useMemo(() => new Set(selectedIds ?? []), [selectedIds]);
  const tripsById = useRef(new Map<number, Trip>());
  tripsById.current = new Map(trips.map((t) => [t.id, t]));
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Create the map once.
  useEffect(() => {
    if (!el.current) return;
    const map = new maplibregl.Map({
      container: el.current,
      style: vectorStyle,
      center: [-40, 30],
      zoom: 1.3,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;
    let fellBack = false;
    map.on("error", (e) => {
      // Vector tiles unreachable → switch to the raster fallback once.
      if (!fellBack && (e as { sourceId?: string }).sourceId === "omt") {
        fellBack = true;
        map.setStyle(offlineStyle);
      }
    });
    map.on("style.load", () => {
      try {
        map.setProjection({ type: globeRef.current ? "globe" : "mercator" });
      } catch { /* older engines: stay flat */ }
      addOverlay(map);
      setReady((n) => n + 1);
    });

    const popup = new maplibregl.Popup({ closeButton: false, offset: 10, className: "tr-popup" });
    map.on("click", "trips-hit", (e) => {
      const id = e.features?.[0]?.properties?.id as number | undefined;
      const t = id != null ? tripsById.current.get(id) : undefined;
      if (t) onSelectRef.current(t);
    });
    map.on("click", "cities", (e) => {
      const p = e.features?.[0]?.properties as { label: string; country: string; nights: number; days: number } | undefined;
      if (!p) return;
      popup
        .setLngLat(e.lngLat)
        .setHTML(`<b>${escapeHtml(p.label)}</b><br><span style="opacity:.7">${escapeHtml(countryName(p.country))}</span><br>${p.nights} nights · ${p.days} days`)
        .addTo(map);
    });
    for (const layer of ["trips-hit", "cities"]) {
      map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
    }
    map.on("mousemove", "trips-hit", (e) => {
      const id = e.features?.[0]?.properties?.id as number | undefined;
      const t = id != null ? tripsById.current.get(id) : undefined;
      if (t) popup.setLngLat(e.lngLat).setHTML(`${MODE_META[t.mode].icon} ${escapeHtml(tripLabel(t))}<br><span style="opacity:.7">${fmtDate(t.departDate)} · ${fmtKm(t.distanceKm)}</span>`).addTo(map);
    });
    map.on("mouseleave", "trips-hit", () => popup.remove());
    return () => map.remove();
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    try {
      map.setProjection({ type: globe ? "globe" : "mercator" });
    } catch { /* ignore */ }
  }, [globe, ready]);

  // Data updates.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("trips") as GeoJSONSource | undefined)?.setData(tripsGeo(trips, sel));
    (map.getSource("cities") as GeoJSONSource | undefined)?.setData(citiesGeo(cities));
  }, [trips, cities, sel, ready]);

  // Frame what matters: the selection if any, else everything — in the part of the map not under the sheet.
  const focusKey = `${[...sel].join(",")}|${trips.map((t) => t.id).join(",")}|${cities.length}|${globe}|${Math.round(bottomInset / 80)}`;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const subset = sel.size ? trips.filter((t) => sel.has(t.id)) : trips;
    const pts: [number, number][] = subset.flatMap((t) => [[t.origin.lon, t.origin.lat], [t.dest.lon, t.dest.lat]] as [number, number][]);
    if (!sel.size) cities.forEach((c) => pts.push([c.lon, c.lat]));
    if (!pts.length) return;
    const h = map.getContainer().clientHeight, w = map.getContainer().clientWidth;
    const padding = { top: 70, left: Math.min(50, w / 8), right: Math.min(50, w / 8), bottom: Math.min(bottomInset + 20, h * 0.7) };
    if (globe) {
      // On a globe, "fit the bounding box" picks odd centres for wide spreads (Mexico + Europe).
      // Aim at the geographic middle of the points and zoom out by how far they spread.
      const { center, radiusKm } = sphericalCenter(pts);
      const zoom = Math.max(0.4, Math.min(sel.size ? 6 : 5, Math.log2(28000 / Math.max(radiusKm, 50)) - 1.6));
      map.easeTo({ center, zoom, padding, duration: 900 });
    } else {
      const b = new maplibregl.LngLatBounds(pts[0], pts[0]);
      pts.forEach((p) => b.extend(p));
      map.fitBounds(b, { padding, maxZoom: sel.size ? 6 : 5, duration: 900 });
    }
  }, [focusKey, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative h-full w-full">
      <div ref={el} className="h-full w-full" />
      <button
        onClick={() => setGlobe(!globe)}
        className="absolute right-3 z-10 rounded-full border border-line bg-panel/80 px-3 py-1.5 text-xs font-medium text-fg backdrop-blur"
        style={{ top: "calc(max(env(safe-area-inset-top), 12px) + 44px)" }}
        aria-label="Toggle globe"
      >
        {globe ? "🗺️ Flat" : "🌍 Globe"}
      </button>
    </div>
  );
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Centre of (roughly) the smallest circle on the sphere containing all points, and
 * its radius in km. Unlike a plain average, a cluster of European stops doesn't
 * drag the centre away from a lone trip to Mexico. (Bădoiu–Clarkson iteration.)
 */
function sphericalCenter(pts: [number, number][]): { center: [number, number]; radiusKm: number } {
  const vec = ([lon, lat]: [number, number]) => {
    const φ = (lat * Math.PI) / 180, λ = (lon * Math.PI) / 180;
    return [Math.cos(φ) * Math.cos(λ), Math.cos(φ) * Math.sin(λ), Math.sin(φ)];
  };
  const toLonLat = ([x, y, z]: number[]): [number, number] => [(Math.atan2(y, x) * 180) / Math.PI, (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI];
  const dist = (a: [number, number], b: [number, number]) => haversineKm(a[1], a[0], b[1], b[0]);
  let c = vec(pts[0]);
  for (let i = 1; i <= 60; i++) {
    const here = toLonLat(c);
    const far = pts.reduce((a, b) => (dist(here, b) > dist(here, a) ? b : a));
    const f = vec(far);
    c = c.map((v, k) => v + (f[k] - v) / (i + 1));
    const n = Math.hypot(...c);
    c = c.map((v) => v / n);
  }
  const center = toLonLat(c);
  return { center, radiusKm: Math.max(...pts.map((p) => dist(center, p))) };
}
