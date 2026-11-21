/** Glyph maps, color palettes, and layout constants for chart rendering. */

export const ZODIAC_SIGNS: string[] = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
];

export const ZODIAC_GLYPHS: Record<string, string> = {
  Aries: "\u2648",
  Taurus: "\u2649",
  Gemini: "\u264A",
  Cancer: "\u264B",
  Leo: "\u264C",
  Virgo: "\u264D",
  Libra: "\u264E",
  Scorpio: "\u264F",
  Sagittarius: "\u2650",
  Capricorn: "\u2651",
  Aquarius: "\u2652",
  Pisces: "\u2653",
};

export const PLANET_GLYPHS: Record<string, string> = {
  Sun: "\u2609",
  Moon: "\u263D",
  Mercury: "\u263F",
  Venus: "\u2640",
  Mars: "\u2642",
  Jupiter: "\u2643",
  Saturn: "\u2644",
  Uranus: "\u2645",
  Neptune: "\u2646",
  Pluto: "\u2647",
};

/** Glyphs for the lunar nodes, Lilith, Chiron, Fortune and Vertex (SharedAspect / ChartPosition ids). */
export const EXTRA_POINT_GLYPHS: Record<string, string> = {
  NorthNode: "\u260A",
  SouthNode: "\u260B",
  Lilith: "\u26B8",
  Chiron: "\u26B7",
  Fortune: "\u2297",
  Vertex: "Vx",
};

/** Short labels of the four chart angles. */
export const ANGLE_LABELS: Record<string, string> = {
  ASC: "ASC",
  DSC: "DSC",
  MC: "MC",
  IC: "IC",
};

export const ASPECT_GLYPHS: Record<string, string> = {
  conjunction: "\u260C",
  opposition: "\u260D",
  trine: "\u25B3",
  square: "\u25A1",
  sextile: "\u26B9",
  "semi-sextile": "\u26BA",
  "semi-square": "\u2220",
  quintile: "Q",
  sesquiquadrate: "\u26BC",
  "bi-quintile": "bQ",
  quincunx: "\u26BB",
};

export const SIGN_ELEMENTS: Record<
  string,
  "fire" | "earth" | "air" | "water"
> = {
  Aries: "fire",
  Taurus: "earth",
  Gemini: "air",
  Cancer: "water",
  Leo: "fire",
  Virgo: "earth",
  Libra: "air",
  Scorpio: "water",
  Sagittarius: "fire",
  Capricorn: "earth",
  Aquarius: "air",
  Pisces: "water",
};

export const ASPECT_COLORS: Record<string, string> = {
  conjunction: "#a855f7",
  opposition: "#ef4444",
  trine: "#60a5fa",
  square: "#f97316",
  sextile: "#34d399",
  // Minor aspects share one muted family and are drawn dashed (see MINOR_ASPECT_TYPES).
  "semi-sextile": "#94a3b8",
  "semi-square": "#fb923c",
  quintile: "#2dd4bf",
  sesquiquadrate: "#f59e0b",
  "bi-quintile": "#22d3ee",
  quincunx: "#c084fc",
};

export const MAJOR_ASPECT_TYPES = ["conjunction", "opposition", "trine", "square", "sextile"] as const;
export const MINOR_ASPECT_TYPES = [
  "semi-sextile",
  "semi-square",
  "quintile",
  "sesquiquadrate",
  "bi-quintile",
  "quincunx",
] as const;

/**
 * Radii of the wheel in viewBox units (the viewBox is `size` square). From the centre outwards:
 * aspect circle -> house ring (numbers) -> planet zone -> degree scale -> sign band. The angle
 * labels sit in the margin outside the sign band.
 */
export const CHART_LAYOUT = {
  size: 1000,
  cx: 500,
  cy: 500,
  /** Outer edge of the sign band. */
  outerRadius: 430,
  /** Inner edge of the sign band = outer edge of the degree scale. */
  signInner: 374,
  /** Inner edge of the degree scale = inner edge of the zodiac ring. */
  zodiacInner: 356,
  /** House cusp lines run from houseInner to houseOuter. */
  houseOuter: 356,
  /** The inner circle: the house ring starts here and the aspect lines stay inside it. */
  houseInner: 200,
  /** Outer edge of the house number ring. */
  houseRingOuter: 238,
  houseNumberRadius: 219,
  /** Centre of a point glyph. */
  planetRadius: 330,
  aspectRadius: 196,
};

/** Tick lengths of the degree scale, hanging inwards from the sign band. */
export const SCALE_TICK_LENGTH = { degree: 5, five: 9, ten: 14 } as const;

/** Radii of the label stack of a plotted point: glyph, degree, sign glyph, minute (outwards to inwards). */
export const POINT_LABEL_RADII = {
  glyph: CHART_LAYOUT.planetRadius,
  degree: 302,
  sign: 281,
  minute: 260,
} as const;

/** Smallest angular distance between two point label stacks, in degrees (see labelSpread.ts). */
export const POINT_LABEL_GAP_DEG = 8;

/** Colour of the four angle axes and their labels. */
export const ANGLE_COLOR = "#e8c969";

/** Smallest angular distance between two labels outside the sign ring (house cusps and angles), in degrees. */
export const OUTER_LABEL_GAP_DEG = 7;

/** A house cusp that lies this close to an angle (degrees) is not labelled: the angle label shows the same value. */
export const CUSP_ANGLE_TOLERANCE_DEG = 0.01;
