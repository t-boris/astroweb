"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calcPlanetPosition = calcPlanetPosition;
exports.computeJulianDay = computeJulianDay;
exports.computeHouseCusps = computeHouseCusps;
const sweph_1 = require("sweph");
const v2_1 = require("firebase-functions/v2");
const constants_1 = require("./constants");
// Initialize Moshier ephemeris once at module load (no data files needed)
(0, sweph_1.set_ephe_path)('');
/**
 * Calculate the position of a celestial body at a given Julian Day.
 * Uses Moshier ephemeris with speed calculation enabled.
 */
function calcPlanetPosition(jd, bodyId) {
    const result = (0, sweph_1.calc_ut)(jd, bodyId, constants_1.CALC_FLAGS);
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
function computeJulianDay(year, month, day, decimalHour) {
    return (0, sweph_1.julday)(year, month, day, decimalHour, sweph_1.constants.SE_GREG_CAL);
}
/**
 * Compute house cusps, ascendant, and midheaven for a given time and location.
 * @param jd - Julian Day number (UT)
 * @param lat - Geographic latitude (positive north)
 * @param lng - Geographic longitude (positive east)
 * @param system - House system code: 'P' (Placidus) or 'W' (Whole Sign)
 */
function computeHouseCusps(jd, lat, lng, system) {
    // Warn about Placidus limitations at high latitudes
    if (system === 'P' && (lat > 66 || lat < -66)) {
        v2_1.logger.warn("Placidus house system may produce invalid results at high latitude", { lat, system });
    }
    const result = (0, sweph_1.houses)(jd, lat, lng, system);
    if (result.flag < 0) {
        throw new Error(`sweph houses failed: flag=${result.flag}`);
    }
    // houses returns a 12-element tuple (0-indexed); convert to array
    const cusps = Array.from(result.data.houses);
    return {
        cusps,
        ascendant: result.data.points[0], // asc
        mc: result.data.points[1], // mc
        armc: result.data.points[2], // armc
    };
}
