/** Result of converting ecliptic longitude to zodiac position */
export interface ZodiacPosition {
    sign: string;
    degreeInSign: number;
}
/**
 * Convert ecliptic longitude to zodiac sign and degree within that sign.
 * Handles negative longitudes and values > 360 via normalization.
 */
export declare function longitudeToZodiac(lon: number): ZodiacPosition;
/**
 * Convenience wrapper: returns only the zodiac sign name for a given longitude.
 */
export declare function longitudeToSign(lon: number): string;
