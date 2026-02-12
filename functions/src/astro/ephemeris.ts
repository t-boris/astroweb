import { set_ephe_path, calc_ut, julday, houses, constants } from 'sweph';
import { logger } from 'firebase-functions/v2';
import { CALC_FLAGS } from './constants';

// Initialize Moshier ephemeris once at module load (no data files needed)
set_ephe_path('');

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

/** House cusps computation result */
export interface HouseCuspsResult {
  cusps: number[];
  ascendant: number;
  mc: number;
  armc: number;
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

  const result = houses(jd, lat, lng, system as 'P' | 'W');
  if (result.flag < 0) {
    throw new Error(`sweph houses failed: flag=${result.flag}`);
  }

  // houses returns a 12-element tuple (0-indexed); convert to array
  const cusps = Array.from(result.data.houses);

  return {
    cusps,
    ascendant: result.data.points[0], // asc
    mc: result.data.points[1],        // mc
    armc: result.data.points[2],      // armc
  };
}
