import fs from 'fs';
import path from 'path';
import type { ComputeChartInput } from '../../astro/chart';

/** Loaders and parsers for the natal parity fixtures (docs/verification/natal-chart-parity.md). */

export const FIXTURE_DIR = path.resolve(__dirname, '../fixtures/natal-parity');

export interface ParityDataset {
  id: 'A' | 'B' | 'C' | 'D';
  label: string;
  role: string;
  birthDate: string;
  birthTime: string;
  lat: number;
  lng: number;
  timezone: string;
  houseSystem: 'placidus' | 'koch' | 'whole-sign';
  utc: string;
}

export function loadDatasets(): ParityDataset[] {
  const raw = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'datasets.json'), 'utf8'));
  return raw.datasets as ParityDataset[];
}

export function chartInput(ds: ParityDataset): ComputeChartInput {
  return {
    birthDate: ds.birthDate,
    birthTime: ds.birthTime,
    timeUnknown: false,
    lat: ds.lat,
    lng: ds.lng,
    timezone: ds.timezone,
    houseSystem: ds.houseSystem,
  };
}

export interface AstroSeekCapture {
  url: string;
  pageSettings: string;
  positions: string[][];
  cusps: string[][];
  planetAspects: string[][];
  otherAspects: string[][];
  speed: string[][];
}

export function loadAstroSeek(id: string, variant: 'default-orbs' | 'fixed15-orbs'): AstroSeekCapture {
  const file = path.join(FIXTURE_DIR, 'astro-seek', `${id}-${variant}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8')) as AstroSeekCapture;
}

export interface HorizonsFixture {
  bodies: Record<string, { longitudes: Record<string, number> }>;
}

export function loadHorizons(): HorizonsFixture {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'horizons', 'horizons-longitudes.json'), 'utf8'));
}

const SIGN_ABBREVIATIONS = ['Ari', 'Tau', 'Gem', 'Can', 'Leo', 'Vir', 'Lib', 'Sco', 'Sag', 'Cap', 'Aqu', 'Pis'];
const SIGN_NAMES = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

/** "9°10’20’’" -> seconds of arc (the sign may be missing; a leading minus is kept). */
export function dmsToArcseconds(text: string): number {
  const m = /^(-?)(\d+)°(\d+)’(?:(\d+)’’)?$/.exec(text.trim());
  if (!m) throw new Error(`Unparseable degree text: ${text}`);
  const total = Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4] ?? 0);
  return m[1] ? -total : total;
}

export function signStartArcseconds(signAbbreviationOrName: string): number {
  const name = signAbbreviationOrName.replace(/\s*\(.*\)$/, '');
  let index = SIGN_ABBREVIATIONS.indexOf(name);
  if (index < 0) index = SIGN_NAMES.indexOf(name);
  if (index < 0) throw new Error(`Unknown sign: ${signAbbreviationOrName}`);
  return index * 30 * 3600;
}

/** Astro-Seek row label -> AstroWeb position id. */
const POSITION_IDS: Record<string, string> = {
  'Node:': 'NorthNode',
  'Lilith:': 'Lilith',
  'Chiron:': 'Chiron',
  'Fortune:': 'Fortune',
  'Vertex:': 'Vertex',
};

export function positionId(label: string): string {
  if (POSITION_IDS[label]) return POSITION_IDS[label];
  return label.replace(':', '');
}

export interface ReferencePoint {
  id: string;
  /** Printed longitude, truncated to a whole arcsecond (0-360 degrees as arcseconds). */
  shownArcseconds: number;
  house: number | null;
  retrograde: boolean | null;
}

/**
 * Motion cell: Retrograde, Direct, "Stationary => D" (turning direct, so not retrograde),
 * "Stationary => R" (turning retrograde) or "-" for points without motion.
 */
export function parseRetrograde(cell: string): boolean | null {
  const text = cell.trim();
  if (text === 'Retrograde' || text === 'Stationary => R') return true;
  if (text === 'Direct' || text === 'Stationary => D') return false;
  if (text === '-') return null;
  throw new Error(`Unparseable motion cell: ${cell}`);
}

/** House cell of the position table: "7", or "end of 3" for a point close to the next cusp. */
export function parseHouse(cell: string): number {
  const m = /^(?:end of )?(\d+)$/.exec(cell.trim());
  if (!m) throw new Error(`Unparseable house cell: ${cell}`);
  return Number(m[1]);
}

/** The 15 listed points of the position table plus ASC and MC from the ecliptic table. */
export function referencePoints(capture: AstroSeekCapture): ReferencePoint[] {
  const points: ReferencePoint[] = capture.positions.map((row) => ({
    id: positionId(row[0]),
    shownArcseconds: signStartArcseconds(row[1]) + dmsToArcseconds(row[2]),
    house: parseHouse(row[3]),
    retrograde: parseRetrograde(row[4]),
  }));
  for (const row of capture.speed) {
    if (row[1] === 'ASC' || row[1] === 'MC') {
      points.push({ id: row[1], shownArcseconds: dmsToArcseconds(row[2]), house: null, retrograde: null });
    }
  }
  return points;
}

export function referenceCusps(capture: AstroSeekCapture): number[] {
  return capture.cusps.map((row) => signStartArcseconds(row[1]) + dmsToArcseconds(row[2]));
}

/** Smaller arc between two longitudes in degrees, in [0, 180]. */
export function circularDeviation(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Bin rule of section 3.2: a longitude agrees with a printed value truncated to one
 * arcsecond when it lies in [shown, shown + 1") widened by a tolerance in arcseconds.
 */
export function insideArcsecondBin(longitudeDegrees: number, shownArcseconds: number, toleranceArcseconds: number): boolean {
  const centre = (shownArcseconds + 0.5) / 3600;
  return circularDeviation(longitudeDegrees, centre) * 3600 <= 0.5 + toleranceArcseconds;
}

/** Tolerance of section 3.3 / 3.2 per point, in arcseconds. */
export function toleranceArcseconds(id: string): number {
  if (id === 'Moon') return 5;
  if (id === 'Pluto') return 3;
  return 1.5;
}

export const ASTRO_SEEK_ASPECT_ANGLES: Record<string, { type: string; angle: number }[]> = {
  Con: [{ type: 'conjunction', angle: 0 }],
  Sem: [{ type: 'semi-sextile', angle: 30 }],
  Oct: [{ type: 'semi-square', angle: 45 }],
  Sex: [{ type: 'sextile', angle: 60 }],
  Squ: [{ type: 'square', angle: 90 }],
  // Astro-Seek abbreviates to three letters, so the code alone is ambiguous:
  Tri: [{ type: 'trine', angle: 120 }, { type: 'sesquiquadrate', angle: 135 }],
  'Bi-': [{ type: 'bi-quintile', angle: 144 }],
  Qui: [{ type: 'quintile', angle: 72 }, { type: 'quincunx', angle: 150 }],
  Opp: [{ type: 'opposition', angle: 180 }],
};

export interface ReferenceAspect {
  a: string;
  b: string;
  type: string;
  /** Printed orb magnitude in whole arcminutes (truncated). */
  shownOrbArcminutes: number;
  negativeOrb: boolean;
  applying: boolean;
}

const ANGLE_LABELS: Record<string, string> = { Ascendant: 'ASC' };

export function aspectPointId(label: string): string {
  if (ANGLE_LABELS[label]) return ANGLE_LABELS[label];
  return positionId(label.endsWith(':') ? label : `${label}:`).replace(':', '');
}

/**
 * Parse an Astro-Seek aspect list. The three-letter code is resolved to a type with the
 * longitudes of the same capture: the exact angle is the separation minus the printed orb.
 */
export function referenceAspects(
  capture: AstroSeekCapture,
  longitudes: Record<string, number>
): ReferenceAspect[] {
  const rows = [...capture.planetAspects, ...capture.otherAspects];
  const result: ReferenceAspect[] = [];
  for (const row of rows) {
    const a = aspectPointId(row[0]);
    const b = aspectPointId(row[2]);
    const m = /^(-?)(\d+)°(\d+)’$/.exec(row[3]);
    if (!m) throw new Error(`Unparseable orb: ${row[3]}`);
    const shownOrbArcminutes = Number(m[2]) * 60 + Number(m[3]);
    const negativeOrb = m[1] === '-';
    const candidates = ASTRO_SEEK_ASPECT_ANGLES[row[1]];
    if (!candidates) throw new Error(`Unknown aspect code: ${row[1]}`);
    const separation = circularDeviation(longitudes[a], longitudes[b]);
    const exact = separation - (negativeOrb ? -1 : 1) * (shownOrbArcminutes / 60);
    const match = candidates.reduce((best, c) =>
      Math.abs(c.angle - exact) < Math.abs(best.angle - exact) ? c : best
    );
    result.push({ a, b, type: match.type, shownOrbArcminutes, negativeOrb, applying: row[4] === 'A' });
  }
  return result;
}

export function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}
