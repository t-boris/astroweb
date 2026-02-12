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
export declare function calcPlanetPosition(jd: number, bodyId: number): PlanetPosition;
/**
 * Convert a calendar date + decimal hour to a Julian Day number.
 * Uses Gregorian calendar.
 */
export declare function computeJulianDay(year: number, month: number, day: number, decimalHour: number): number;
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
export declare function computeHouseCusps(jd: number, lat: number, lng: number, system: string): HouseCuspsResult;
