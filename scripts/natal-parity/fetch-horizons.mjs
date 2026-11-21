#!/usr/bin/env node
/**
 * Fetches independent geocentric ecliptic longitudes of the ten standard bodies from
 * NASA JPL Horizons (DEC-013) for every instant in the natal-parity fixtures.
 *
 * Usage (Node 22, no dependencies):
 *   node scripts/natal-parity/fetch-horizons.mjs
 *
 * Request parameters (recorded in the output as release evidence):
 *   EPHEM_TYPE=OBSERVER, CENTER=500@399 (geocenter), QUANTITIES=31 (observer ecliptic
 *   longitude/latitude, apparent, true ecliptic and equinox of date), TIME_TYPE=UT,
 *   TLIST=<Julian Day of each fixture's UTC instant>.
 *
 * Output (committed): functions/src/__tests__/fixtures/natal-parity/horizons/
 *   horizons-longitudes.json  parsed longitudes, request parameters, header notes
 *   raw/<Body>.txt            the complete Horizons response text for each body
 *
 * JPL asks clients to avoid unnecessary requests, so the responses are committed and the
 * acceptance tests read them; run this script only to refresh the snapshots.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixtures = join(root, "functions", "src", "__tests__", "fixtures", "natal-parity");
const API = "https://ssd.jpl.nasa.gov/api/horizons.api";

/** Horizons body-centre commands for the ten standard bodies. */
const BODIES = [
  ["Sun", "10"],
  ["Moon", "301"],
  ["Mercury", "199"],
  ["Venus", "299"],
  ["Mars", "499"],
  ["Jupiter", "599"],
  ["Saturn", "699"],
  ["Uranus", "799"],
  ["Neptune", "899"],
  ["Pluto", "999"],
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const julianDayUt = (utcIso) => Date.parse(utcIso) / 86400000 + 2440587.5;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2002-Mar-30 01:30:00.000" -> epoch milliseconds (UT read as UTC). */
function parseHorizonsDate(text) {
  const match = /^(\d{4})-([A-Za-z]{3})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/.exec(text);
  if (!match) throw new Error(`Unrecognized Horizons date: ${text}`);
  const [, year, month, day, hour, minute, second, fraction = "0"] = match;
  return Date.UTC(+year, MONTHS.indexOf(month), +day, +hour, +minute, +second, Math.round(Number(`0.${fraction}`) * 1000));
}

const { datasets } = JSON.parse(await readFile(join(fixtures, "datasets.json"), "utf8"));
const instants = datasets.map((d) => ({ id: d.id, utc: d.utc, jd: julianDayUt(d.utc) }));

const request = {
  EPHEM_TYPE: "OBSERVER",
  CENTER: "500@399",
  QUANTITIES: "31",
  TIME_TYPE: "UT",
  ANG_FORMAT: "DEG",
  CSV_FORMAT: "YES",
  OBJ_DATA: "NO",
  TLIST: instants.map((i) => i.jd.toFixed(7)).join(" "),
};

await mkdir(join(fixtures, "horizons", "raw"), { recursive: true });

const out = {
  schema: 1,
  source: "NASA JPL Horizons API",
  endpoint: API,
  fetchedAt: new Date().toISOString(),
  request,
  note:
    "Apparent geocentric (center 500@399) ecliptic longitude of date for the body centre, " +
    "from the JPL DE441 numerical ephemeris. Times are UT as Julian Day of the fixture UTC instant.",
  instants,
  bodies: {},
};

for (const [name, command] of BODIES) {
  const params = new URLSearchParams({ format: "json", COMMAND: `'${command}'` });
  for (const [key, value] of Object.entries(request)) params.set(key, `'${value}'`);
  const response = await fetch(`${API}?${params}`);
  if (!response.ok) throw new Error(`Horizons ${name}: HTTP ${response.status}`);
  const body = await response.json();
  const text = body.result;
  const soe = text.indexOf("$$SOE");
  const eoe = text.indexOf("$$EOE");
  if (soe < 0 || eoe < 0) throw new Error(`Horizons ${name}: no ephemeris table\n${text.slice(0, 800)}`);
  const rows = text
    .slice(soe + 5, eoe)
    .trim()
    .split("\n")
    .map((line) => line.split(",").map((cell) => cell.trim()));
  if (rows.length !== instants.length) throw new Error(`Horizons ${name}: expected ${instants.length} rows, got ${rows.length}`);

  // Horizons returns the rows in chronological order, not in TLIST order: match every row
  // to its instant by the printed UT date instead of by position.
  const longitudes = {};
  const latitudes = {};
  for (const cells of rows) {
    const instant = instants.find((i) => Math.abs(parseHorizonsDate(cells[0]) - Date.parse(i.utc)) < 1000);
    if (!instant) throw new Error(`Horizons ${name}: row ${cells[0]} matches no fixture instant`);
    longitudes[instant.id] = Number(cells[3]);
    latitudes[instant.id] = Number(cells[4]);
  }
  const target = /Target body name: (.*?)\s{2,}/.exec(text)?.[1] ?? name;
  out.bodies[name] = { command, target, longitudes, latitudes };
  out.signature = body.signature;
  out.header ??= {
    center: /Center-site name: (.*)/.exec(text)?.[1]?.trim(),
    centerBody: /Center body name: (.*?)\s{2,}/.exec(text)?.[1],
    targetSource: /\{source: (DE\d+)\}/.exec(text)?.[1],
    lightBending: /Rel\. light bend : (.*?)\s{2,}/.exec(text)?.[1],
    refraction: /Atmos refraction: (.*)/.exec(text)?.[1]?.trim(),
    calendarMode: /Calendar mode   : (.*)/.exec(text)?.[1]?.trim(),
    eopFile: /EOP file        : (.*)/.exec(text)?.[1]?.trim(),
  };
  await writeFile(join(fixtures, "horizons", "raw", `${name}.txt`), text);
  console.log(`${name.padEnd(8)}`, Object.entries(longitudes).map(([id, lon]) => `${id}=${lon.toFixed(7)}`).join("  "));
  await sleep(1500);
}

await writeFile(join(fixtures, "horizons", "horizons-longitudes.json"), JSON.stringify(out, null, 2) + "\n");
console.log("written horizons-longitudes.json");
