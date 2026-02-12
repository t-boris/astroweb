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

/** Maps house system names to sweph single-char codes */
export const HOUSE_SYSTEM_CODES: Record<string, string> = {
  placidus: 'P',
  'whole-sign': 'W',
};

/** Computation flags: speed calculation + Moshier ephemeris (no data files needed) */
export const CALC_FLAGS = constants.SEFLG_SPEED | constants.SEFLG_MOSEPH;
