// Static files the map needs, generated from node_modules before every build/dev run:
//  - MapLibre 6 loads its web worker from a URL next to its own module, which the
//    Next.js bundle doesn't preserve, so serve a copy (see setWorkerUrl in MapView).
//  - A small built-in world map (Natural Earth 1:110m via world-atlas), so the globe
//    always shows continents and borders even if the online map tiles can't load.
import fs from "node:fs";
import { feature, mesh } from "topojson-client";

const nm = (p) => new URL(`../node_modules/${p}`, import.meta.url);
const pub = (p) => new URL(`../public/${p}`, import.meta.url);

fs.copyFileSync(nm("maplibre-gl/dist/maplibre-gl-worker.mjs"), pub("maplibre-gl-worker.mjs"));

// Rings that cross the 180° meridian (Fiji, eastern Russia) jump from -180 to +180;
// on a globe that draws a line around the whole planet. Keep each ring continuous.
const unwrapRing = (ring) => {
  let prev = ring[0][0];
  return ring.map(([lon, lat]) => {
    while (lon - prev > 180) lon -= 360;
    while (lon - prev < -180) lon += 360;
    prev = lon;
    return [lon, lat];
  });
};
const unwrap = (fc) => {
  for (const f of fc.features) {
    const g = f.geometry;
    if (g.type === "Polygon") g.coordinates = g.coordinates.map(unwrapRing);
    else if (g.type === "MultiPolygon") g.coordinates = g.coordinates.map((p) => p.map(unwrapRing));
  }
  return fc;
};

const topo = JSON.parse(fs.readFileSync(nm("world-atlas/countries-110m.json"), "utf8"));
const round = (geo) => JSON.parse(JSON.stringify(geo, (k, v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v)));
fs.writeFileSync(pub("world-land.geojson"), JSON.stringify(round(unwrap(feature(topo, topo.objects.countries)))));
fs.writeFileSync(pub("world-borders.geojson"), JSON.stringify(round(mesh(topo, topo.objects.countries, (a, b) => a !== b))));
console.log("map assets ready in public/");
