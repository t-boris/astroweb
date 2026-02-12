"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.longitudeToZodiac = longitudeToZodiac;
exports.longitudeToSign = longitudeToSign;
const constants_1 = require("./constants");
/**
 * Convert ecliptic longitude to zodiac sign and degree within that sign.
 * Handles negative longitudes and values > 360 via normalization.
 */
function longitudeToZodiac(lon) {
    const normalized = ((lon % 360) + 360) % 360;
    const signIndex = Math.floor(normalized / 30);
    const degreeInSign = normalized % 30;
    return {
        sign: constants_1.ZODIAC_SIGNS[signIndex],
        degreeInSign,
    };
}
/**
 * Convenience wrapper: returns only the zodiac sign name for a given longitude.
 */
function longitudeToSign(lon) {
    return longitudeToZodiac(lon).sign;
}
