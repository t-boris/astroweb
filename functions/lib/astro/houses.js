"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateHouses = calculateHouses;
exports.findHouseForLongitude = findHouseForLongitude;
const ephemeris_1 = require("./ephemeris");
const constants_1 = require("./constants");
/**
 * Calculate house cusps for a given Julian Day, geographic coordinates, and house system.
 * Returns a ChartHouses object with system name, 12 cusp longitudes, ASC, and MC.
 */
function calculateHouses(jd, lat, lng, system) {
    const systemCode = constants_1.HOUSE_SYSTEM_CODES[system];
    if (!systemCode) {
        throw new Error(`Unknown house system: ${system}`);
    }
    const result = (0, ephemeris_1.computeHouseCusps)(jd, lat, lng, systemCode);
    return {
        system,
        cusps: result.cusps,
        asc: result.ascendant,
        mc: result.mc,
    };
}
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
function findHouseForLongitude(lon, cusps) {
    const normalized = ((lon % 360) + 360) % 360;
    for (let i = 0; i < 12; i++) {
        const cuspStart = cusps[i];
        const cuspEnd = cusps[(i + 1) % 12];
        if (cuspStart <= cuspEnd) {
            // Normal case: no wrap-around
            if (normalized >= cuspStart && normalized < cuspEnd) {
                return i + 1;
            }
        }
        else {
            // Wrap-around case: cusp crosses 0 degrees
            if (normalized >= cuspStart || normalized < cuspEnd) {
                return i + 1;
            }
        }
    }
    // Fallback: should not reach here with valid cusps, but return house 1
    return 1;
}
