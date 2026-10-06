// Regenerates src/data/airports.json from the public mwgg/Airports dataset.
// Usage: node scripts/build-airports.mjs [path-to-airports.json]
import fs from "node:fs";

const SRC = "https://raw.githubusercontent.com/mwgg/Airports/master/airports.json";
const raw = process.argv[2]
  ? JSON.parse(fs.readFileSync(process.argv[2], "utf8"))
  : await (await fetch(SRC)).json();

const out = {};
for (const a of Object.values(raw)) {
  if (!a.iata || !/^[A-Z]{3}$/.test(a.iata)) continue;
  // [name, city, countryCode, lat, lon, tz]
  out[a.iata] = [a.name, a.city || a.name, a.country, +a.lat.toFixed(4), +a.lon.toFixed(4), a.tz || ""];
}
fs.writeFileSync(new URL("../src/data/airports.json", import.meta.url), JSON.stringify(out));
console.log(`wrote ${Object.keys(out).length} airports`);
