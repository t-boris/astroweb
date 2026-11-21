/**
 * View-model helpers shared by the wheel, the tables, the aspect matrix and the summaries.
 * Every profile view reads the chart through these functions so that sign, degree, minute,
 * house, retrograde marker and aspect values cannot diverge between views (REQ-002, REQ-003).
 */
import type {
  ChartAngles,
  ChartPosition,
  ChartResult,
  SharedAspect,
} from "./types";
import { ZODIAC_SIGNS } from "./constants";

/** Ids of the four chart angles in SharedAspect.a / .b. */
export const ANGLE_IDS = ["ASC", "DSC", "MC", "IC"] as const;
export type AngleId = (typeof ANGLE_IDS)[number];

export function isAngleId(id: string): id is AngleId {
  return (ANGLE_IDS as readonly string[]).includes(id);
}

const LEGACY_IDS = new Set([
  "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
]);

/** The calculated points of the chart in display order: ten bodies, nodes, Lilith, Chiron, Fortune, Vertex. */
export function getPositions(chart: ChartResult): ChartPosition[] {
  if (chart.positions) return chart.positions;
  // A result without the additive fields (calculation version 1) carries the ten bodies only.
  return chart.points
    .filter((p) => LEGACY_IDS.has(p.body))
    .map((p) => ({
      id: p.body as ChartPosition["id"],
      kind: "planet" as const,
      lon: p.lon,
      sign: p.sign,
      degreeInSign: p.degreeInSign,
      house: p.house,
      retrograde: null,
      speed: null,
    }));
}

/** ASC, DSC, MC and IC; null when the birth time is unknown. */
export function getAngles(chart: ChartResult): ChartAngles | null {
  if (chart.angles !== undefined) return chart.angles;
  const { asc, mc } = chart.houses;
  if (asc === null || mc === null) return null;
  return { asc, dsc: (asc + 180) % 360, mc, ic: (mc + 180) % 360 };
}

/** Exact angle of each aspect type that a chart cached before calculation version 2 can contain. */
const LEGACY_EXACT_ANGLES: Record<ChartResult["aspects"][number]["type"], number> = {
  conjunction: 0,
  sextile: 60,
  square: 90,
  trine: 120,
  opposition: 180,
};

/** Longitude of a point or angle named in a legacy aspect (ten bodies, ASC, MC). */
function legacyLongitude(chart: ChartResult, id: string): number | null {
  if (id === "ASC") return chart.houses.asc;
  if (id === "MC") return chart.houses.mc;
  return chart.points.find((p) => p.body === id)?.lon ?? null;
}

/**
 * The shared aspect set used by the wheel, the matrix and the Aspects list. A chart cached before
 * calculation version 2 only has the five major aspects of the legacy list: their signed orb is rebuilt
 * from the longitudes (actual angle minus exact angle) and no applying or separating status is known.
 */
export function getSharedAspects(chart: ChartResult): SharedAspect[] {
  if (chart.sharedAspects) return chart.sharedAspects;
  return chart.aspects.map((a) => {
    const lonA = legacyLongitude(chart, a.a);
    const lonB = legacyLongitude(chart, a.b);
    let signedOrb = a.orb;
    if (lonA !== null && lonB !== null) {
      const raw = Math.abs(lonA - lonB) % 360;
      const separation = raw > 180 ? 360 - raw : raw;
      signedOrb = Math.round((separation - LEGACY_EXACT_ANGLES[a.type]) * 10000) / 10000;
    }
    return {
      a: a.a,
      b: a.b,
      type: a.type,
      major: true,
      orb: a.orb,
      signedOrb,
      maxOrb: 6,
      exactness: a.exactness,
      applying: null,
    };
  });
}

/** Longitude of any plotted id: a position id or one of ASC, DSC, MC, IC. */
export function longitudeOfId(chart: ChartResult, id: string): number | null {
  const angles = getAngles(chart);
  if (id === "ASC") return angles?.asc ?? null;
  if (id === "DSC") return angles?.dsc ?? null;
  if (id === "MC") return angles?.mc ?? null;
  if (id === "IC") return angles?.ic ?? null;
  return getPositions(chart).find((p) => p.id === id)?.lon ?? null;
}

export interface SignDegree {
  sign: string;
  signIndex: number;
  degree: number;
  minute: number;
}

/**
 * Split a longitude into sign, degree and minute. Minutes are truncated, not rounded, like the
 * reference charts (14°33.972′ is shown as 14°33′). A tiny epsilon keeps a value such as
 * 29.999999999 from showing as 29°59′ when the stored value is meant to be 30°00′ of the next sign.
 */
export function splitLongitude(lon: number): SignDegree {
  const normalized = ((lon % 360) + 360) % 360;
  const totalMinutes = Math.floor(normalized * 60 + 1e-7) % 21600;
  const signIndex = Math.floor(totalMinutes / 1800);
  const inSign = totalMinutes - signIndex * 1800;
  return {
    sign: ZODIAC_SIGNS[signIndex],
    signIndex,
    degree: Math.floor(inSign / 60),
    minute: inSign % 60,
  };
}

/** "9°05′" style text of the degree within a sign. */
export function formatDegreeMinute(lon: number): string {
  const { degree, minute } = splitLongitude(lon);
  return `${degree}°${String(minute).padStart(2, "0")}′`;
}

/** Angle between the orb and its allowance as "1°23′". The orb is in degrees. */
export function formatOrb(orbDegrees: number): string {
  const totalMinutes = Math.floor(Math.abs(orbDegrees) * 60 + 1e-7);
  return `${Math.floor(totalMinutes / 60)}°${String(totalMinutes % 60).padStart(2, "0")}′`;
}

/** True when the birth time is unknown and the remaining positions are local-noon estimates. */
export function isTimeEstimated(chart: ChartResult): boolean {
  return chart.context?.timeEstimated ?? chart.meta.timeUsed === null;
}

export interface HouseSystemInfo {
  requested: ChartResult["meta"]["houseSystem"];
  used: ChartResult["meta"]["houseSystem"];
  /** True when the requested system could not be calculated and Whole Sign was used. */
  fellBack: boolean;
}

export function getHouseSystemInfo(chart: ChartResult): HouseSystemInfo {
  const used = chart.context?.usedHouseSystem ?? chart.meta.houseSystem;
  const requested = chart.context?.requestedHouseSystem ?? used;
  return { requested, used, fellBack: requested !== used };
}

/**
 * Longitude that is drawn on the left (9 o'clock) axis of the wheel: the house 1 cusp when the
 * birth time is known, 0° Aries otherwise (REQ-001). In Whole Sign this is the start of the
 * Ascendant's sign, so the ASC itself is drawn at its own longitude inside house 1.
 */
export function wheelRotation(chart: ChartResult): number {
  if (isTimeEstimated(chart)) return 0;
  return chart.houses.cusps[0] ?? 0;
}
