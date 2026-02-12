/** Celestial body definition for computation */
export interface BodyDef {
    id: number;
    name: string;
}
/** The 10 main celestial bodies used in natal chart computation */
export declare const BODIES: readonly BodyDef[];
/** The 12 zodiac signs in ecliptic order */
export declare const ZODIAC_SIGNS: readonly ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
/** Major aspect definitions with default orbs */
export declare const ASPECT_DEFINITIONS: readonly [{
    readonly type: "conjunction";
    readonly angle: 0;
    readonly orb: 6;
}, {
    readonly type: "sextile";
    readonly angle: 60;
    readonly orb: 6;
}, {
    readonly type: "square";
    readonly angle: 90;
    readonly orb: 6;
}, {
    readonly type: "trine";
    readonly angle: 120;
    readonly orb: 6;
}, {
    readonly type: "opposition";
    readonly angle: 180;
    readonly orb: 6;
}];
/** Maps house system names to sweph single-char codes */
export declare const HOUSE_SYSTEM_CODES: Record<string, string>;
/** Computation flags: speed calculation + Moshier ephemeris (no data files needed) */
export declare const CALC_FLAGS: number;
