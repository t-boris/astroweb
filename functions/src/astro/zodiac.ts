import { ZODIAC_SIGNS } from './constants';

/** Result of converting ecliptic longitude to zodiac position */
export interface ZodiacPosition {
  sign: string;
  degreeInSign: number;
}

/**
 * Convert ecliptic longitude to zodiac sign and degree within that sign.
 * Handles negative longitudes and values > 360 via normalization.
 */
export function longitudeToZodiac(lon: number): ZodiacPosition {
  const normalized = ((lon % 360) + 360) % 360;
  const signIndex = Math.floor(normalized / 30);
  const degreeInSign = normalized % 30;
  return {
    sign: ZODIAC_SIGNS[signIndex],
    degreeInSign,
  };
}

/**
 * Convenience wrapper: returns only the zodiac sign name for a given longitude.
 */
export function longitudeToSign(lon: number): string {
  return longitudeToZodiac(lon).sign;
}
