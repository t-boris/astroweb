import { ChartHouses } from '../types/index';
/**
 * Calculate house cusps for a given Julian Day, geographic coordinates, and house system.
 * Returns a ChartHouses object with system name, 12 cusp longitudes, ASC, and MC.
 */
export declare function calculateHouses(jd: number, lat: number, lng: number, system: 'placidus' | 'koch' | 'whole-sign'): ChartHouses;
/**
 * Determine which house (1-12) a given ecliptic longitude falls in,
 * based on the 12 house cusp longitudes.
 *
 * Handles the 0/360 wrap-around: if cusp[N] > cusp[N+1], the planet
 * is in that house if lon >= cusp[N] OR lon < cusp[N+1].
 *
 * @param lon - Ecliptic longitude of the point (0-360)
 * @param cusps - Array of 12 cusp longitudes (0-indexed, house 1 = cusps[0])
 * @returns House number 1-12
 */
export declare function findHouseForLongitude(lon: number, cusps: number[]): number;
