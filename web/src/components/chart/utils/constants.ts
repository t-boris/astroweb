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

export const ASPECT_GLYPHS: Record<string, string> = {
  conjunction: "\u260C",
  opposition: "\u260D",
  trine: "\u25B3",
  square: "\u25A1",
  sextile: "\u26B9",
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

export const ELEMENT_COLORS = {
  fire: {
    fill: "rgba(239, 68, 68, 0.08)",
    stroke: "#ef4444",
    text: "#fca5a5",
  },
  earth: {
    fill: "rgba(34, 197, 94, 0.08)",
    stroke: "#22c55e",
    text: "#86efac",
  },
  air: {
    fill: "rgba(234, 179, 8, 0.08)",
    stroke: "#eab308",
    text: "#fde047",
  },
  water: {
    fill: "rgba(59, 130, 246, 0.08)",
    stroke: "#3b82f6",
    text: "#93c5fd",
  },
};

export const ASPECT_COLORS: Record<string, string> = {
  conjunction: "#a855f7",
  opposition: "#ef4444",
  trine: "#60a5fa",
  square: "#f97316",
  sextile: "#34d399",
};

export const CHART_LAYOUT = {
  size: 1000,
  cx: 500,
  cy: 500,
  outerRadius: 460,
  zodiacInner: 380,
  houseOuter: 380,
  houseInner: 200,
  planetRadius: 340,
  aspectRadius: 195,
};
