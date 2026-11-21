/**
 * Chart data contract shared by the web app, the Cloud Functions and the chart drawing code.
 * `web/src/types/index.ts` and `functions/src/types/index.ts` re-export these types.
 */

export interface ChartPoint {
  body: string; // "Sun", "Moon", "Mercury", etc.
  lon: number; // Ecliptic longitude (0-360)
  sign: string; // "Aries", "Taurus", etc.
  degreeInSign: number; // 0-30
  house: number | null; // House number (1-12) or null if unknown
}

export interface ChartHouses {
  system: "placidus" | "koch" | "whole-sign";
  cusps: number[]; // 12 cusp longitudes (0-360)
  asc: number | null; // Ascendant longitude
  mc: number | null; // Midheaven longitude
}

export interface ChartAspect {
  a: string; // Body name A
  b: string; // Body name B
  type: "conjunction" | "opposition" | "trine" | "square" | "sextile";
  orb: number; // Actual orb in degrees
  exactness: number; // 0-1, how exact (1 = perfect)
}

export interface ChartMeta {
  houseSystem: "placidus" | "koch" | "whole-sign";
  zodiac: "tropical";
  timeUsed: string | null; // HH:mm or null
  timezoneUsed: string;
}

/** Every aspect type of the shared set (DEC-017); ChartAspect["type"] is its major subset. */
export type SharedAspectType =
  | "conjunction"
  | "semi-sextile"
  | "semi-square"
  | "sextile"
  | "quintile"
  | "square"
  | "trine"
  | "sesquiquadrate"
  | "bi-quintile"
  | "quincunx"
  | "opposition";

/** Ids of the calculated points in ChartPosition.id and in SharedAspect.a / .b (angles use ASC, DSC, MC, IC). */
export type PositionId =
  | "Sun" | "Moon" | "Mercury" | "Venus" | "Mars" | "Jupiter" | "Saturn"
  | "Uranus" | "Neptune" | "Pluto"
  | "NorthNode" | "SouthNode" | "Lilith" | "Chiron" | "Fortune" | "Vertex";

/** A calculated point of the extended natal chart (the ten bodies plus the added points). */
export interface ChartPosition {
  id: PositionId;
  kind: "planet" | "node" | "point";
  lon: number; // Ecliptic longitude (0-360)
  sign: string;
  degreeInSign: number; // 0-30
  house: number | null; // null when the birth time is unknown
  /** True when the point moves backwards, false when direct, null when motion does not apply (Fortune, Vertex). */
  retrograde: boolean | null;
  /** Daily motion in degrees; null when motion does not apply. */
  speed: number | null;
}

/** Chart angles; only present when the birth time is known. */
export interface ChartAngles {
  asc: number;
  dsc: number;
  mc: number;
  ic: number;
}

/** One aspect of the shared set used by the wheel, the aspect matrix and the Aspects list. */
export interface SharedAspect {
  a: string; // PositionId or "ASC" | "DSC" | "MC" | "IC"
  b: string;
  type: SharedAspectType;
  major: boolean;
  orb: number; // Absolute orb in degrees (distance from the exact angle)
  /** Actual angle minus exact angle, in degrees; the sign follows the Astro-Seek convention. */
  signedOrb: number;
  maxOrb: number; // Orb allowance that applied to this pair and type
  exactness: number; // 0-1 (1 = exact)
  /**
   * True when applying, false when separating. Null for a pair of two points that move with the daily
   * rotation (ASC, DSC, MC, IC, Vertex, Fortune): the reference does not follow one rule for them (DEC-017).
   */
  applying: boolean | null;
}

export interface ChartContext {
  calcVersion: number;
  requestedHouseSystem: "placidus" | "koch" | "whole-sign";
  /** House system actually used; differs from the requested one when a fallback happened. */
  usedHouseSystem: "placidus" | "koch" | "whole-sign";
  utc: string; // ISO 8601 instant used for the calculation
  lat: number;
  lng: number;
  timezone: string;
  /** True when the birth time is unknown and noon local time was used. */
  timeEstimated: boolean;
  conventions: {
    node: "mean";
    lilith: "mean";
    fortune: "by-horizon";
  };
  /** False when Chiron could not be calculated (outside the bundled ephemeris range or file unreadable). */
  chironAvailable: boolean;
}

export interface ChartResult {
  meta: ChartMeta;
  points: ChartPoint[];
  houses: ChartHouses;
  aspects: ChartAspect[];
  // Additive fields (DEC-014). Charts cached before calcVersion 2 lack them.
  context?: ChartContext;
  positions?: ChartPosition[];
  angles?: ChartAngles | null;
  sharedAspects?: SharedAspect[];
}
