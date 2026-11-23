import type { ChartReadingInput, ReadLongitude, SolvedBirth, SolverBody } from "../astro/chartSolver";
import type { ReadChartPoint, ReadChartPointId } from "../types";
import type { SupportedLanguage } from "./prompts";

/**
 * Explain my natal chart: turning the model's reading of a chart picture into solver input, and the
 * recovered birth into words for the portrait. Pure functions; the callables are in api/chartReading.ts.
 */

const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
] as const;

/** Names, abbreviations and glyphs a model may use for a sign, lower case, mapped to its index. */
const SIGN_ALIASES: Record<string, number> = {};
const RU_SIGNS = ["овен", "телец", "близнецы", "рак", "лев", "дева", "весы", "скорпион", "стрелец", "козерог", "водолей", "рыбы"];
const GLYPHS = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];
SIGNS.forEach((name, index) => {
  SIGN_ALIASES[name.toLowerCase()] = index;
  SIGN_ALIASES[name.slice(0, 3).toLowerCase()] = index;
  SIGN_ALIASES[RU_SIGNS[index]] = index;
  SIGN_ALIASES[GLYPHS[index]] = index;
});

const POINT_IDS: readonly ReadChartPointId[] = [
  "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
  "NorthNode", "Chiron", "Lilith",
];
const SOLVER_BODIES = new Set<string>(["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]);
const POINT_ALIASES: Record<string, ReadChartPointId> = {
  node: "NorthNode",
  northnode: "NorthNode",
  truenode: "NorthNode",
  meannode: "NorthNode",
  blackmoonlilith: "Lilith",
};

/** Width of the bin a read value stands for, degrees: a printed minute, a printed degree, or a glyph placed by eye. */
export const RESOLUTION = { minute: 1 / 60, degree: 1, estimated: 3 } as const;

export interface NormalizedReading {
  isNatalChart: boolean;
  zodiac: "tropical" | "sidereal" | "unknown";
  points: ReadChartPoint[];
  asc: ReadChartPoint | null;
  mc: ReadChartPoint | null;
  notes: string;
}

function signIndex(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const index = SIGN_ALIASES[value.trim().toLowerCase()];
  return index === undefined ? null : index;
}

function wholeNumber(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function pointId(value: unknown): ReadChartPointId | null {
  if (typeof value !== "string") return null;
  const key = value.replace(/[\s_-]/g, "").toLowerCase();
  if (POINT_ALIASES[key]) return POINT_ALIASES[key];
  return POINT_IDS.find((id) => id.toLowerCase() === key) ?? null;
}

/** One read position, or null when the sign or the degree is missing or out of range. */
function readPoint(id: ReadChartPointId, raw: unknown): ReadChartPoint | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const sign = signIndex(item.sign);
  const degree = wholeNumber(item.degree, 0, 29);
  if (sign === null || degree === null) return null;
  const minute = item.minute === null || item.minute === undefined ? null : wholeNumber(item.minute, 0, 59);
  if (minute === null && item.minute !== null && item.minute !== undefined) return null;
  const estimated = item.estimated === true;
  // A printed value is the start of its bin (charts truncate); a position judged by eye is the middle of a wider one.
  const longitude = estimated
    ? sign * 30 + degree + 0.5 - RESOLUTION.estimated / 2
    : sign * 30 + degree + (minute ?? 0) / 60;
  return {
    id,
    sign: SIGNS[sign],
    degree,
    minute: estimated ? null : minute,
    retrograde: typeof item.retrograde === "boolean" ? item.retrograde : null,
    estimated,
    longitude: longitude < 0 ? longitude + 360 : longitude,
    resolution: estimated ? RESOLUTION.estimated : minute === null ? RESOLUTION.degree : RESOLUTION.minute,
  };
}

/**
 * The model's JSON (see CHART_IMAGE_READING_SYSTEM) checked and cleaned: sign names in any of
 * English, Russian, three-letter or glyph form; out-of-range values and unknown points dropped;
 * the first reading of a point kept when it is listed twice.
 */
export function normalizeChartReading(raw: unknown): NormalizedReading {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const points: ReadChartPoint[] = [];
  for (const item of Array.isArray(value.points) ? value.points : []) {
    const id = pointId((item as Record<string, unknown> | null)?.id);
    if (!id || points.some((p) => p.id === id)) continue;
    const point = readPoint(id, item);
    if (point) points.push(point);
  }
  const zodiac = value.zodiac === "tropical" || value.zodiac === "sidereal" ? value.zodiac : "unknown";
  return {
    isNatalChart: value.isNatalChart !== false && points.length > 0,
    zodiac,
    points,
    asc: readPoint("ASC", value.asc),
    mc: readPoint("MC", value.mc),
    notes: typeof value.notes === "string" ? value.notes.trim().slice(0, 300) : "",
  };
}

function toRead(point: ReadChartPoint): ReadLongitude {
  return { longitude: point.longitude, resolution: point.resolution };
}

/** What the solver uses: the ten bodies, ASC and MC. */
export function solverInput(reading: NormalizedReading): ChartReadingInput {
  const bodies: ChartReadingInput["bodies"] = {};
  for (const point of reading.points) {
    if (SOLVER_BODIES.has(point.id)) bodies[point.id as SolverBody] = toRead(point);
  }
  return {
    bodies,
    asc: reading.asc ? toRead(reading.asc) : null,
    mc: reading.mc ? toRead(reading.mc) : null,
  };
}

/** The read points with the solver's verdict on each (bodies, ASC and MC; the other points are not checked). */
export function withVerdicts(reading: NormalizedReading, solved: SolvedBirth): NormalizedReading {
  const verdict = (point: ReadChartPoint): ReadChartPoint => {
    const solvedPoint = solved.points.find((p) => p.id === point.id);
    return solvedPoint
      ? { ...point, matched: solvedPoint.matched, deviationArcmin: Math.round(solvedPoint.deviationArcmin * 10) / 10 }
      : point;
  };
  return {
    ...reading,
    points: reading.points.map(verdict),
    asc: reading.asc ? verdict(reading.asc) : null,
    mc: reading.mc ? verdict(reading.mc) : null,
  };
}

function formatDate(isoDate: string, language: SupportedLanguage): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  // Day-month-year in both languages ("30 March 2002", "30 марта 2002 г.").
  return new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

function roundUp(value: number): number {
  return Math.max(1, Math.ceil(value));
}

/** What the story is told from: a recovered birth, or a profile's birth in an Admin test run (time may be unknown). */
export interface StoryBirth {
  birthDate: string;
  birthTime: string | null;
  lat: number | null;
  lng: number | null;
  timeAccuracyMinutes: number | null;
  placeAccuracyKm: number | null;
}

/** The birth in words for the portrait prompt, in the output language. */
export function describeRecoveredBirth(birth: StoryBirth, placeName: string | null, language: SupportedLanguage): string {
  const ru = language === "ru";
  const parts: string[] = [`${ru ? "примерно" : "around"} ${formatDate(birth.birthDate, language)}`];
  if (birth.birthTime) {
    const accuracy = birth.timeAccuracyMinutes === null ? "" : ` (± ${roundUp(birth.timeAccuracyMinutes)} ${ru ? "мин" : "min"})`;
    parts.push(ru ? `около ${birth.birthTime} по местному времени${accuracy}` : `at about ${birth.birthTime} local time${accuracy}`);
  } else {
    parts.push(ru ? "время рождения неизвестно" : "time of birth unknown");
  }
  if (birth.lat !== null && birth.lng !== null) {
    const where = placeName?.trim()
      ? placeName.trim().slice(0, 120)
      : `${Math.abs(birth.lat).toFixed(1)}°${birth.lat >= 0 ? "N" : "S"} ${Math.abs(birth.lng).toFixed(1)}°${birth.lng >= 0 ? "E" : "W"}`;
    const km = birth.placeAccuracyKm === null ? "" : ru ? ` (в пределах ~${roundUp(birth.placeAccuracyKm)} км)` : ` (within about ${roundUp(birth.placeAccuracyKm)} km)`;
    parts.push(ru ? `рядом с ${where}${km}` : `near ${where}${km}`);
  } else {
    parts.push(ru ? "место рождения неизвестно" : "place of birth unknown");
  }
  return parts.join(", ");
}
