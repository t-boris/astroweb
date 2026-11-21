import { constants } from 'sweph';

/** Celestial body definition for computation */
export interface BodyDef {
  id: number;
  name: string;
}

/** The 10 main celestial bodies used in natal chart computation */
export const BODIES: readonly BodyDef[] = [
  { id: constants.SE_SUN, name: 'Sun' },
  { id: constants.SE_MOON, name: 'Moon' },
  { id: constants.SE_MERCURY, name: 'Mercury' },
  { id: constants.SE_VENUS, name: 'Venus' },
  { id: constants.SE_MARS, name: 'Mars' },
  { id: constants.SE_JUPITER, name: 'Jupiter' },
  { id: constants.SE_SATURN, name: 'Saturn' },
  { id: constants.SE_URANUS, name: 'Uranus' },
  { id: constants.SE_NEPTUNE, name: 'Neptune' },
  { id: constants.SE_PLUTO, name: 'Pluto' },
] as const;

/** The 12 zodiac signs in ecliptic order */
export const ZODIAC_SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
] as const;

/** Major aspect definitions with default orbs */
export const ASPECT_DEFINITIONS = [
  { type: 'conjunction' as const, angle: 0, orb: 6 },
  { type: 'sextile' as const, angle: 60, orb: 6 },
  { type: 'square' as const, angle: 90, orb: 6 },
  { type: 'trine' as const, angle: 120, orb: 6 },
  { type: 'opposition' as const, angle: 180, orb: 6 },
] as const;

/**
 * Version of the calculation rules behind ChartResult. It is part of the chart
 * cache key, so bumping it makes every cached chart be recalculated on read.
 *
 * 2: additive fields (positions, angles, sharedAspects, context) and the
 *    Chiron / nodes / Lilith / Fortune / Vertex conventions of DEC-010, DEC-015, DEC-016, DEC-017.
 */
export const CALC_VERSION = 2;

/**
 * Orb table of the shared aspect set (DEC-017, derived from the Astro-Seek default orbs).
 * Majors get a wider orb when the Sun or Moon is involved; the six minors use one orb.
 */
export const SHARED_ASPECT_DEFINITIONS = [
  { type: 'conjunction' as const, angle: 0, major: true, orb: 7, luminaryOrb: 10 },
  { type: 'semi-sextile' as const, angle: 30, major: false, orb: 2.5, luminaryOrb: 2.5 },
  { type: 'semi-square' as const, angle: 45, major: false, orb: 2.5, luminaryOrb: 2.5 },
  { type: 'sextile' as const, angle: 60, major: true, orb: 4, luminaryOrb: 6 },
  { type: 'quintile' as const, angle: 72, major: false, orb: 2.5, luminaryOrb: 2.5 },
  { type: 'square' as const, angle: 90, major: true, orb: 7, luminaryOrb: 10 },
  { type: 'trine' as const, angle: 120, major: true, orb: 7, luminaryOrb: 10 },
  { type: 'sesquiquadrate' as const, angle: 135, major: false, orb: 2.5, luminaryOrb: 2.5 },
  { type: 'bi-quintile' as const, angle: 144, major: false, orb: 2.5, luminaryOrb: 2.5 },
  { type: 'quincunx' as const, angle: 150, major: false, orb: 2.5, luminaryOrb: 2.5 },
  { type: 'opposition' as const, angle: 180, major: true, orb: 7, luminaryOrb: 10 },
] as const;

/** Maps house system names to sweph single-char codes */
export const HOUSE_SYSTEM_CODES: Record<string, string> = {
  placidus: 'P',
  koch: 'K',
  'whole-sign': 'W',
};

/** Computation flags: speed calculation + Moshier ephemeris (no data files needed) */
export const CALC_FLAGS = constants.SEFLG_SPEED | constants.SEFLG_MOSEPH;
