import path from 'path';
import { set_ephe_path, calc_ut, julday, houses, houses_armc, constants } from 'sweph';
import { logger } from 'firebase-functions/v2';
import { CALC_FLAGS } from './constants';

/**
 * Directory with the bundled Swiss Ephemeris asteroid file (seas_18.se1, DEC-015).
 * Only Chiron reads it. Every other body is calculated with the Moshier flag in
 * CALC_FLAGS, which does not use data files. The same relative path resolves from
 * src/astro in tests and from lib/astro in the deployed functions.
 */
export const EPHE_DIR = path.resolve(__dirname, '../../ephe');
set_ephe_path(EPHE_DIR);

/** Computed planetary position result */
export interface PlanetPosition {
  longitude: number;
  latitude: number;
  distance: number;
  longitudeSpeed: number;
}

/**
 * Calculate the position of a celestial body at a given Julian Day.
 * Uses Moshier ephemeris with speed calculation enabled.
 */
export function calcPlanetPosition(jd: number, bodyId: number): PlanetPosition {
  const result = calc_ut(jd, bodyId, CALC_FLAGS);
  if (result.flag < 0) {
    throw new Error(`sweph calc_ut failed for body ${bodyId}: ${result.error}`);
  }
  return {
    longitude: result.data[0],
    latitude: result.data[1],
    distance: result.data[2],
    longitudeSpeed: result.data[3],
  };
}

/**
 * Convert a calendar date + decimal hour to a Julian Day number.
 * Uses Gregorian calendar.
 */
export function computeJulianDay(
  year: number,
  month: number,
  day: number,
  decimalHour: number
): number {
  return julday(year, month, day, decimalHour, constants.SE_GREG_CAL);
}

/**
 * Calculate Chiron. It needs the bundled asteroid file, which covers 1800-2400.
 * Returns null outside that range or when the file cannot be read, so a chart
 * without Chiron is returned instead of an error (DEC-015).
 */
export function calcChironPosition(jd: number): PlanetPosition | null {
  try {
    return calcPlanetPosition(jd, constants.SE_CHIRON);
  } catch (err) {
    logger.warn('Chiron unavailable', { jd, error: (err as Error).message });
    return null;
  }
}

/** House cusps computation result */
export interface HouseCuspsResult {
  cusps: number[];
  ascendant: number;
  mc: number;
  armc: number;
  vertex: number;
}

/**
 * Compute house cusps, ascendant, and midheaven for a given time and location.
 * @param jd - Julian Day number (UT)
 * @param lat - Geographic latitude (positive north)
 * @param lng - Geographic longitude (positive east)
 * @param system - House system code: 'P' (Placidus) or 'W' (Whole Sign)
 */
export function computeHouseCusps(
  jd: number,
  lat: number,
  lng: number,
  system: string
): HouseCuspsResult {
  // Warn about Placidus limitations at high latitudes
  if (system === 'P' && (lat > 66 || lat < -66)) {
    logger.warn("Placidus house system may produce invalid results at high latitude", { lat, system });
  }

  // The ARMC comes from the standard Swiss Ephemeris call. The cusps, ASC, MC and
  // Vertex are then derived with the mean obliquity of the ecliptic: the reference
  // charts (Astro-Seek) do so, and with the true obliquity the quadrant cusps differ
  // by up to 6 arcseconds and the Vertex by up to 27 (docs/verification/natal-chart-parity.md, section 5).
  const base = houses(jd, lat, lng, system as 'P' | 'W');
  if (base.flag < 0) {
    throw new Error(`sweph houses failed: flag=${base.flag}`);
  }
  const armc = base.data.points[2];
  const meanObliquity = calc_ut(jd, constants.SE_ECL_NUT, 0).data[1];
  const result = houses_armc(armc, lat, meanObliquity, system as 'P' | 'W');
  if (result.flag < 0) {
    throw new Error(`sweph houses_armc failed: flag=${result.flag}`);
  }

  // houses returns a 12-element tuple (0-indexed); convert to array
  const cusps = Array.from(result.data.houses);

  return {
    cusps,
    ascendant: result.data.points[0], // asc
    mc: result.data.points[1],        // mc
    armc: result.data.points[2],      // armc
    vertex: result.data.points[3],    // vertex
  };
}
