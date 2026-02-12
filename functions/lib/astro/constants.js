"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CALC_FLAGS = exports.HOUSE_SYSTEM_CODES = exports.ASPECT_DEFINITIONS = exports.ZODIAC_SIGNS = exports.BODIES = void 0;
const sweph_1 = require("sweph");
/** The 10 main celestial bodies used in natal chart computation */
exports.BODIES = [
    { id: sweph_1.constants.SE_SUN, name: 'Sun' },
    { id: sweph_1.constants.SE_MOON, name: 'Moon' },
    { id: sweph_1.constants.SE_MERCURY, name: 'Mercury' },
    { id: sweph_1.constants.SE_VENUS, name: 'Venus' },
    { id: sweph_1.constants.SE_MARS, name: 'Mars' },
    { id: sweph_1.constants.SE_JUPITER, name: 'Jupiter' },
    { id: sweph_1.constants.SE_SATURN, name: 'Saturn' },
    { id: sweph_1.constants.SE_URANUS, name: 'Uranus' },
    { id: sweph_1.constants.SE_NEPTUNE, name: 'Neptune' },
    { id: sweph_1.constants.SE_PLUTO, name: 'Pluto' },
];
/** The 12 zodiac signs in ecliptic order */
exports.ZODIAC_SIGNS = [
    'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
    'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];
/** Major aspect definitions with default orbs */
exports.ASPECT_DEFINITIONS = [
    { type: 'conjunction', angle: 0, orb: 6 },
    { type: 'sextile', angle: 60, orb: 6 },
    { type: 'square', angle: 90, orb: 6 },
    { type: 'trine', angle: 120, orb: 6 },
    { type: 'opposition', angle: 180, orb: 6 },
];
/** Maps house system names to sweph single-char codes */
exports.HOUSE_SYSTEM_CODES = {
    placidus: 'P',
    koch: 'K',
    'whole-sign': 'W',
};
/** Computation flags: speed calculation + Moshier ephemeris (no data files needed) */
exports.CALC_FLAGS = sweph_1.constants.SEFLG_SPEED | sweph_1.constants.SEFLG_MOSEPH;
