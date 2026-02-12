"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTimezoneFromCoords = getTimezoneFromCoords;
const geo_tz_1 = require("geo-tz");
/**
 * Resolve IANA timezone from coordinates using geo-tz.
 * Returns the primary timezone for the given lat/lng, or "UTC" if none found.
 */
function getTimezoneFromCoords(lat, lng) {
    const results = (0, geo_tz_1.find)(lat, lng);
    return results[0] || "UTC";
}
