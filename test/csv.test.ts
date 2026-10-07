import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLocationCsv, splitCsvLine } from "../src/lib/csv.ts";

test("splits quoted fields", () => {
  assert.deepEqual(splitCsvLine('a,"b, c",d'), ["a", "b, c", "d"]);
  assert.deepEqual(splitCsvLine('"say ""hi""",x'), ['say "hi"', "x"]);
});

test("parses the n8n ubicaciones.csv format", () => {
  const csv = [
    "fecha,lat,lon,ciudad,pais,codigo,direccion",
    '2026-06-06,25.4383093876729,-100.142386678156,Santiago,México,MX,"Santiago, Nuevo León, 67300, México"',
    '2026-10-06T23:25:32.000Z,25.6263,-100.354,San Pedro Garza García,México,MX,"Calle Cerro de Picachos, México"',
    "",
  ].join("\n");
  const { rows, skipped } = parseLocationCsv(csv);
  assert.equal(skipped, 1); // header
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { date: "2026-06-06", time: null, lat: 25.4383093876729, lon: -100.142386678156, city: "Santiago", country: "MX", source: "import" });
  assert.equal(rows[1].city, "San Pedro Garza García");
  assert.match(rows[1].date, /^2026-10-0[67]$/); // depends on the test machine's time zone
});

test("rows without coordinates are skipped, not imported as 0,0", () => {
  const { rows, skipped } = parseLocationCsv(["2026-02-01,,,,,,", "2026-02-02,0,0,Unknown,,,", "2026-02-03,25.62,-100.35,Monterrey,México,MX,x"].join("\n"));
  assert.equal(rows.length, 1);
  assert.equal(skipped, 2);
});
