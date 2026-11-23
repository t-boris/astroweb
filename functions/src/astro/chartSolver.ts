import { DateTime } from 'luxon';
import { constants } from 'sweph';
import { calcPlanetPosition, computeHouseCusps, computeJulianDay } from './ephemeris';
import { getTimezoneFromCoords } from '../utils/timezone';

/**
 * Finds the birth moment and place behind a chart that was read from a picture.
 *
 * The positions of the bodies depend only on the moment, and their combination does not repeat:
 * the slow bodies fix the year, the Sun the day, the Moon the time. MC then depends on the
 * moment and the longitude only, and ASC on the moment, the longitude and the latitude.
 * Everything is calculated like the profile charts (Moshier, mean obliquity for the angles).
 */

/** The bodies the solver uses, keyed like the chart positions. */
export const SOLVER_BODIES = {
  Sun: constants.SE_SUN,
  Moon: constants.SE_MOON,
  Mercury: constants.SE_MERCURY,
  Venus: constants.SE_VENUS,
  Mars: constants.SE_MARS,
  Jupiter: constants.SE_JUPITER,
  Saturn: constants.SE_SATURN,
  Uranus: constants.SE_URANUS,
  Neptune: constants.SE_NEPTUNE,
  Pluto: constants.SE_PLUTO,
} as const;

export type SolverBody = keyof typeof SOLVER_BODIES;

/** A longitude as printed on a chart: truncated to `resolution` degrees (1/60 with minutes, 1 with degrees only). */
export interface ReadLongitude {
  longitude: number;
  resolution: number;
}

export interface ChartReadingInput {
  bodies: Partial<Record<SolverBody, ReadLongitude>>;
  asc?: ReadLongitude | null;
  mc?: ReadLongitude | null;
}

export interface SolvedPoint {
  id: SolverBody | 'ASC' | 'MC';
  /** Centre of the printed bin, degrees. */
  read: number;
  /** Longitude calculated for the solved moment (and place for ASC and MC), degrees. */
  calculated: number;
  /** Distance of the calculated longitude from the printed bin, arcminutes (0 inside the bin). */
  deviationArcmin: number;
  matched: boolean;
}

export type SolveStatus = 'matched' | 'partial' | 'no_match';

export interface SolvedBirth {
  status: SolveStatus;
  /** Why nothing was found (no_match only). */
  reason: 'missing_sun' | 'too_few_points' | 'no_consistent_moment' | null;
  /** The moment, UTC, ISO 8601 to the second. */
  utc: string | null;
  /** True when the Moon was read, so the time of day is known. */
  timeKnown: boolean;
  /** True when ASC and MC were read, so the place is known. */
  placeKnown: boolean;
  lat: number | null;
  lng: number | null;
  /** Half width of the time window, minutes (null without the Moon). */
  timeAccuracyMinutes: number | null;
  /** Largest distance of a solution inside the reading bins from the reported place, km (null without ASC and MC). */
  placeAccuracyKm: number | null;
  points: SolvedPoint[];
  maxDeviationArcmin: number | null;
}

export interface SolveOptions {
  fromYear?: number;
  toYear?: number;
}

const DEFAULT_FROM_YEAR = 1800;
const DEFAULT_TO_YEAR = 2100;
/** A body counts as matched when it lies within this many arcminutes of its printed bin. */
const MATCH_SLACK_ARCMIN = 2;
/** Cap of one body's contribution to the score of a candidate year, degrees. */
const SCORE_CAP_DEGREES = 10;
/** Candidate years examined in full after the first pass. */
const CANDIDATE_YEARS = 4;
const EARTH_RADIUS_KM = 6371;
const UNIX_EPOCH_JD = 2440587.5;
const LATITUDE_LIMIT = 80;

/** Signed smallest difference a - b, in (-180, 180]. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % 360;
  if (d <= -180) d += 360;
  if (d > 180) d -= 360;
  return d;
}

function normalize(longitude: number): number {
  const d = longitude % 360;
  return d < 0 ? d + 360 : d;
}

/** Centre of the printed bin: the printed value is truncated, so the true one lies in [shown, shown + resolution). */
function binCentre(read: ReadLongitude): number {
  return normalize(read.longitude + read.resolution / 2);
}

/**
 * Distance outside the printed bin [shown, shown + resolution), arcminutes. The bin is widened by half its
 * width on each side, so a chart that rounds instead of truncating still matches.
 */
function deviationArcmin(calculated: number, read: ReadLongitude): number {
  const outside = Math.abs(angleDiff(calculated, binCentre(read))) - read.resolution;
  return Math.max(0, outside) * 60;
}

function bodyAt(jd: number, body: SolverBody) {
  return calcPlanetPosition(jd, SOLVER_BODIES[body]);
}

/** The moment near `start` when `body` stands at `target`, by Newton's method on its own longitude. */
function timeForLongitude(body: SolverBody, target: number, start: number): number | null {
  let jd = start;
  for (let i = 0; i < 12; i += 1) {
    const { longitude, longitudeSpeed } = bodyAt(jd, body);
    const diff = angleDiff(target, longitude);
    if (Math.abs(diff) < 1e-7) return jd;
    if (Math.abs(longitudeSpeed) < 1e-6) return null;
    jd += diff / longitudeSpeed;
  }
  return Math.abs(angleDiff(target, bodyAt(jd, body).longitude)) < 1e-5 ? jd : null;
}

/** Sum of the capped deviations of the read bodies (except those listed) at `jd`, degrees. */
function score(jd: number, bodies: ChartReadingInput['bodies'], skip: SolverBody[]): number {
  let total = 0;
  for (const [body, read] of Object.entries(bodies) as [SolverBody, ReadLongitude][]) {
    if (skip.includes(body)) continue;
    const deviation = Math.abs(angleDiff(bodyAt(jd, body).longitude, binCentre(read)));
    total += Math.min(SCORE_CAP_DEGREES, Math.max(0, deviation - read.resolution));
  }
  return total;
}

/** The moments, one per year, when the Sun stands where it was read; best scored first. */
function sunMoments(reading: ChartReadingInput, fromYear: number, toYear: number): number[] {
  const sun = binCentre(reading.bodies.Sun as ReadLongitude);
  const found: { jd: number; score: number }[] = [];
  for (let year = fromYear; year <= toYear; year += 1) {
    const jan1 = computeJulianDay(year, 1, 1, 0);
    const start = jan1 + normalize(sun - bodyAt(jan1, 'Sun').longitude) / 0.9856;
    const jd = timeForLongitude('Sun', sun, start);
    if (jd === null || found.some((f) => Math.abs(f.jd - jd) < 1)) continue;
    found.push({ jd, score: score(jd, reading.bodies, ['Sun', 'Moon']) });
  }
  return found.sort((a, b) => a.score - b.score).slice(0, CANDIDATE_YEARS).map((f) => f.jd);
}

/** The moment the Moon stands where it was read, within the window the Sun allows around `sunMoment`. */
function moonMoment(reading: ChartReadingInput, sunMoment: number, target = binCentre(reading.bodies.Moon as ReadLongitude)): number | null {
  const sunRead = reading.bodies.Sun as ReadLongitude;
  // The Sun moves about a degree a day: its printed bin (plus slack) bounds the time.
  const window = (sunRead.resolution + MATCH_SLACK_ARCMIN / 60) / 0.95 + 0.05;
  const jd = timeForLongitude('Moon', target, sunMoment);
  if (jd !== null && Math.abs(jd - sunMoment) <= window) return jd;
  // Start from both ends of the window when Newton left it (the Moon target may sit near the edge).
  for (const start of [sunMoment - window, sunMoment + window]) {
    const other = timeForLongitude('Moon', target, start);
    if (other !== null && Math.abs(other - sunMoment) <= window) return other;
  }
  return null;
}

/** Longitude of the place where MC stands at `mcTarget` at `jd` (MC does not depend on the latitude). */
export function longitudeForMc(jd: number, mcTarget: number): number {
  let lng = angleDiff(mcTarget, computeHouseCusps(jd, 0, 0, 'W').mc);
  for (let i = 0; i < 30; i += 1) {
    const diff = angleDiff(mcTarget, computeHouseCusps(jd, 0, lng, 'W').mc);
    if (Math.abs(diff) < 1e-8) break;
    lng = angleDiff(lng + diff, 0);
  }
  return lng;
}

/**
 * Latitude of the place at longitude `lng` where ASC stands at `ascTarget` at `jd`. For a fixed
 * sidereal time ASC sweeps half the zodiac monotonically with the latitude, so the root is unique.
 */
export function latitudeForAsc(jd: number, lng: number, ascTarget: number): number | null {
  const f = (lat: number) => angleDiff(ascTarget, computeHouseCusps(jd, lat, lng, 'W').ascendant);
  let previousLat = -LATITUDE_LIMIT;
  let previous = f(previousLat);
  for (let lat = -LATITUDE_LIMIT + 1; lat <= LATITUDE_LIMIT; lat += 1) {
    const current = f(lat);
    // A sign change with small values is a root; a jump across ±180 is the far side of the circle.
    if (Math.sign(current) !== Math.sign(previous) && Math.abs(current - previous) < 90) {
      let lo = previousLat;
      let hi = lat;
      let fLo = previous;
      for (let i = 0; i < 50; i += 1) {
        const mid = (lo + hi) / 2;
        const fMid = f(mid);
        if (Math.sign(fMid) === Math.sign(fLo)) {
          lo = mid;
          fLo = fMid;
        } else {
          hi = mid;
        }
      }
      return (lo + hi) / 2;
    }
    if (current === 0) return lat;
    previousLat = lat;
    previous = current;
  }
  return null;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

function placeFor(jd: number, ascTarget: number, mcTarget: number): { lat: number; lng: number } | null {
  const lng = longitudeForMc(jd, mcTarget);
  const lat = latitudeForAsc(jd, lng, ascTarget);
  return lat === null ? null : { lat, lng };
}

export function julianDayToIso(jd: number): string {
  const ms = Math.round((jd - UNIX_EPOCH_JD) * 86_400_000 / 1000) * 1000;
  return new Date(ms).toISOString().replace('.000Z', 'Z');
}

function points(jd: number, reading: ChartReadingInput, place: { lat: number; lng: number } | null): SolvedPoint[] {
  const result: SolvedPoint[] = [];
  for (const [body, read] of Object.entries(reading.bodies) as [SolverBody, ReadLongitude][]) {
    const calculated = bodyAt(jd, body).longitude;
    const deviation = deviationArcmin(calculated, read);
    result.push({ id: body, read: binCentre(read), calculated, deviationArcmin: deviation, matched: deviation <= MATCH_SLACK_ARCMIN });
  }
  if (place && reading.asc && reading.mc) {
    const angles = computeHouseCusps(jd, place.lat, place.lng, 'W');
    for (const [id, read, calculated] of [
      ['ASC', reading.asc, angles.ascendant],
      ['MC', reading.mc, angles.mc],
    ] as const) {
      const deviation = deviationArcmin(calculated, read);
      result.push({ id, read: binCentre(read), calculated, deviationArcmin: deviation, matched: deviation <= MATCH_SLACK_ARCMIN });
    }
  }
  return result;
}

function noMatch(reason: SolvedBirth['reason']): SolvedBirth {
  return {
    status: 'no_match',
    reason,
    utc: null,
    timeKnown: false,
    placeKnown: false,
    lat: null,
    lng: null,
    timeAccuracyMinutes: null,
    placeAccuracyKm: null,
    points: [],
    maxDeviationArcmin: null,
  };
}

/**
 * The birth moment and place that reproduce the read chart. The status is "matched" when every read
 * point lies within its printed bin (plus two arcminutes), "partial" when the Sun and Moon fit but
 * some other points do not (a misread on the picture), and "no_match" when no moment fits.
 */
export function solveBirth(reading: ChartReadingInput, options: SolveOptions = {}): SolvedBirth {
  const fromYear = options.fromYear ?? DEFAULT_FROM_YEAR;
  const toYear = options.toYear ?? DEFAULT_TO_YEAR;
  if (!reading.bodies.Sun) return noMatch('missing_sun');
  const others = Object.keys(reading.bodies).filter((b) => b !== 'Sun' && b !== 'Moon');
  if (others.length < 3) return noMatch('too_few_points');

  const hasMoon = Boolean(reading.bodies.Moon);
  let best: { jd: number; score: number } | null = null;
  for (const sunMoment of sunMoments(reading, fromYear, toYear)) {
    const jd = hasMoon ? moonMoment(reading, sunMoment) : sunMoment;
    if (jd === null) continue;
    const candidate = { jd, score: score(jd, reading.bodies, []) };
    if (!best || candidate.score < best.score) best = candidate;
  }
  if (!best) return noMatch('no_consistent_moment');

  const jd = best.jd;
  const placeKnown = Boolean(reading.asc && reading.mc);
  const place = placeKnown ? placeFor(jd, binCentre(reading.asc as ReadLongitude), binCentre(reading.mc as ReadLongitude)) : null;
  const solvedPoints = points(jd, reading, place);
  const unmatched = solvedPoints.filter((p) => !p.matched);
  const luminariesFit = solvedPoints.filter((p) => p.id === 'Sun' || p.id === 'Moon').every((p) => p.matched);
  const bodiesRead = Object.keys(reading.bodies).length;
  const bodyMisses = unmatched.filter((p) => p.id !== 'ASC' && p.id !== 'MC').length;
  let status: SolveStatus = unmatched.length === 0 ? 'matched' : 'partial';
  if (!luminariesFit || bodyMisses > Math.floor(bodiesRead / 3)) status = 'no_match';
  if (status === 'no_match') return { ...noMatch('no_consistent_moment'), points: solvedPoints };

  // Accuracy: solve again at the edges of the printed bins and measure how far the answer moves.
  let timeAccuracyMinutes: number | null = null;
  const moments = [jd];
  if (hasMoon) {
    const moon = reading.bodies.Moon as ReadLongitude;
    for (const edge of [moon.longitude, moon.longitude + moon.resolution]) {
      const t = moonMoment(reading, jd, normalize(edge));
      if (t !== null) moments.push(t);
    }
    timeAccuracyMinutes = Math.max(...moments.map((t) => Math.abs(t - jd))) * 1440;
  }
  let placeAccuracyKm: number | null = null;
  if (place && reading.asc && reading.mc) {
    const asc = reading.asc;
    const mc = reading.mc;
    let farthest = 0;
    for (const t of moments) {
      for (const ascEdge of [asc.longitude, asc.longitude + asc.resolution]) {
        for (const mcEdge of [mc.longitude, mc.longitude + mc.resolution]) {
          const other = placeFor(t, normalize(ascEdge), normalize(mcEdge));
          if (other) farthest = Math.max(farthest, haversineKm(place.lat, place.lng, other.lat, other.lng));
        }
      }
    }
    placeAccuracyKm = farthest;
  }

  return {
    status,
    reason: null,
    utc: julianDayToIso(jd),
    timeKnown: hasMoon,
    placeKnown: place !== null,
    lat: place?.lat ?? null,
    lng: place?.lng ?? null,
    timeAccuracyMinutes,
    placeAccuracyKm,
    points: solvedPoints,
    maxDeviationArcmin: Math.max(0, ...solvedPoints.map((p) => p.deviationArcmin)),
  };
}

export interface LocalBirthData {
  /** YYYY-MM-DD in the zone of the place, or the UTC date when the place is unknown. */
  birthDate: string;
  /** HH:mm in the zone of the place; null when the time or the place is unknown. */
  birthTime: string | null;
  timezone: string | null;
}

/** The solved moment as the clock and calendar of the birth place showed it. */
export function localBirthData(solved: SolvedBirth): LocalBirthData | null {
  if (!solved.utc) return null;
  const utc = DateTime.fromISO(solved.utc, { zone: 'utc' });
  if (solved.lat === null || solved.lng === null) {
    return { birthDate: utc.toFormat('yyyy-MM-dd'), birthTime: null, timezone: null };
  }
  const timezone = getTimezoneFromCoords(solved.lat, solved.lng);
  // Rounded to the minute, as birth times are entered.
  const local = utc.setZone(timezone).plus({ seconds: 30 }).startOf('minute');
  return {
    birthDate: local.toFormat('yyyy-MM-dd'),
    birthTime: solved.timeKnown ? local.toFormat('HH:mm') : null,
    timezone,
  };
}
