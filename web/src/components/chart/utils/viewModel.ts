/**
 * View-model for the position table, the aspect list, the aspect matrix and the two summaries.
 * Everything here reads the chart through positions.ts, so sign, degree, minute, house, retrograde
 * marker and aspect values are the same ones the wheel draws (REQ-002, REQ-003, REQ-004).
 */
import type { TFunction } from "i18next";
import type { ChartResult, PositionId, SharedAspect } from "@/types";
import { ANGLE_LABELS, EXTRA_POINT_GLYPHS, PLANET_GLYPHS, SIGN_ELEMENTS } from "./constants";
import { formatOrb, getAngles, getPositions, isTimeEstimated, splitLongitude } from "./positions";

/** Ids of the rows of the position table: the calculated points plus the two angles of the table. */
export type TablePointId = PositionId | "ASC" | "MC";

export interface TablePoint {
  id: TablePointId;
  kind: "planet" | "node" | "point" | "angle";
  lon: number;
  sign: string;
  /** Truncated degree and minute inside the sign, as shown in every view. */
  degree: number;
  minute: number;
  /** Position inside the sign in degrees, built from the truncated degree and minute. */
  degreeInSign: number;
  /** House number; null when the birth time is unknown. */
  house: number | null;
  /** True when retrograde, false when direct, null when motion does not apply. */
  retrograde: boolean | null;
}

function normalize(lon: number): number {
  return ((lon % 360) + 360) % 360;
}

/** Tolerance, in degrees, for a longitude that sits on a cusp up to floating point error. */
const CUSP_EPSILON = 1e-7;

/**
 * House (1-12) that contains a longitude, or null for a malformed cusp list. A longitude within
 * CUSP_EPSILON before a cusp belongs to the house that starts there, so an angle that coincides
 * with a cusp (ASC on cusp 1, MC on cusp 10 in Koch and Placidus) is not pushed into the previous house.
 */
export function houseOfLongitude(lon: number, cusps: readonly number[]): number | null {
  if (cusps.length !== 12) return null;
  for (let i = 0; i < 12; i++) {
    const start = normalize(cusps[i]);
    const span = normalize(cusps[(i + 1) % 12] - start);
    if (normalize(lon - start + CUSP_EPSILON) < span) return i + 1;
  }
  return null;
}

function toTablePoint(
  id: TablePointId,
  kind: TablePoint["kind"],
  lon: number,
  house: number | null,
  retrograde: boolean | null,
): TablePoint {
  const { sign, degree, minute } = splitLongitude(lon);
  return { id, kind, lon, sign, degree, minute, degreeInSign: degree + minute / 60, house, retrograde };
}

/**
 * The rows of the position table in display order: the ten bodies, the nodes, Lilith, Chiron,
 * Fortune, Vertex, then ASC and MC. ASC and MC are absent when the birth time is unknown.
 */
export function getTablePoints(chart: ChartResult): TablePoint[] {
  const rows = getPositions(chart).map((p) => toTablePoint(p.id, p.kind, p.lon, p.house, p.retrograde));
  const angles = getAngles(chart);
  if (angles && !isTimeEstimated(chart)) {
    const { cusps } = chart.houses;
    rows.push(toTablePoint("ASC", "angle", angles.asc, houseOfLongitude(angles.asc, cusps), null));
    rows.push(toTablePoint("MC", "angle", angles.mc, houseOfLongitude(angles.mc, cusps), null));
  }
  return rows;
}

/**
 * Points of the aspect matrix and of both summaries: every row of the position table except the
 * South Node, which always mirrors the North Node and takes no part in aspects (DEC-017).
 */
export function getAnalysisPoints(chart: ChartResult): TablePoint[] {
  return getTablePoints(chart).filter((p) => p.id !== "SouthNode");
}

/** Glyph of a point or angle id; ASC and MC use their short label. */
export function pointGlyph(id: string): string {
  return PLANET_GLYPHS[id] ?? EXTRA_POINT_GLYPHS[id] ?? ANGLE_LABELS[id] ?? "";
}

/** Localized name of a point or angle id (`natalChart.points.*`). */
export function pointLabel(t: TFunction, id: string): string {
  return t(`natalChart.points.${id}`, id);
}

// ---- House systems ---------------------------------------------------------------------------

export type HouseSystem = ChartResult["meta"]["houseSystem"];

/** The systems the profile offers, in display order (DEC-009). */
export const HOUSE_SYSTEMS: readonly HouseSystem[] = ["koch", "whole-sign", "placidus"];

/** Koch is the system the profile chart opens with (DEC-009). */
export const DEFAULT_HOUSE_SYSTEM: HouseSystem = "koch";

/** Localized name of a house system (`houseAreas.houseSystemNames.*`). */
export function houseSystemName(t: TFunction, system: HouseSystem): string {
  return t(`houseAreas.houseSystemNames.${system === "whole-sign" ? "wholeSign" : system}`);
}

// ---- Aspects ---------------------------------------------------------------------------------

/** Orb as "-1°23′" or "+0°05′": degrees and minutes with the sign of the signed orb (actual angle minus exact angle). */
export function formatSignedOrb(aspect: Pick<SharedAspect, "signedOrb">): string {
  const text = formatOrb(aspect.signedOrb);
  if (text === "0°00′") return text;
  return `${aspect.signedOrb < 0 ? "−" : "+"}${text}`;
}

/** Key of a pair of points that does not depend on the order of the two ids. */
export function aspectPairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Aspects whose two endpoints are both among the given points (drops DSC and IC for the matrix). */
export function aspectsAmong(aspects: readonly SharedAspect[], points: readonly TablePoint[]): SharedAspect[] {
  const ids = new Set<string>(points.map((p) => p.id));
  return aspects.filter((aspect) => ids.has(aspect.a) && ids.has(aspect.b));
}

// ---- Element and modality summary -----------------------------------------------------------

export type Element = "fire" | "earth" | "air" | "water";
export type Modality = "cardinal" | "fixed" | "mutable";

export const ELEMENTS: readonly Element[] = ["fire", "earth", "air", "water"];
export const MODALITIES: readonly Modality[] = ["cardinal", "fixed", "mutable"];

export const SIGN_MODALITIES: Record<string, Modality> = {
  Aries: "cardinal",
  Taurus: "fixed",
  Gemini: "mutable",
  Cancer: "cardinal",
  Leo: "fixed",
  Virgo: "mutable",
  Libra: "cardinal",
  Scorpio: "fixed",
  Sagittarius: "mutable",
  Capricorn: "cardinal",
  Aquarius: "fixed",
  Pisces: "mutable",
};

export interface ElementModalityGroups {
  cells: Record<Element, Record<Modality, TablePoint[]>>;
  elementTotals: Record<Element, number>;
  modalityTotals: Record<Modality, number>;
  total: number;
}

export function groupByElementModality(points: readonly TablePoint[]): ElementModalityGroups {
  const cells = {} as ElementModalityGroups["cells"];
  const elementTotals = {} as ElementModalityGroups["elementTotals"];
  const modalityTotals = {} as ElementModalityGroups["modalityTotals"];
  for (const element of ELEMENTS) {
    cells[element] = { cardinal: [], fixed: [], mutable: [] };
    elementTotals[element] = 0;
  }
  for (const modality of MODALITIES) modalityTotals[modality] = 0;

  for (const point of points) {
    const element = SIGN_ELEMENTS[point.sign];
    const modality = SIGN_MODALITIES[point.sign];
    cells[element][modality].push(point);
    elementTotals[element] += 1;
    modalityTotals[modality] += 1;
  }
  return { cells, elementTotals, modalityTotals, total: points.length };
}

// ---- 0-30 degree strip -----------------------------------------------------------------------

export interface StripMarker {
  point: TablePoint;
  /** Position on the 0-30 degree scale as a percentage (0-100). */
  x: number;
  /** Row of the marker; 0 is the row next to the scale. Markers closer than the gap go to different rows. */
  lane: number;
}

/**
 * Place every point at its degree within its sign on a 0-30 degree scale. Points whose labels would
 * overlap (closer than `gapPercent` of the scale) are moved to different rows instead of being hidden.
 */
export function layoutDegreeStrip(points: readonly TablePoint[], gapPercent: number): StripMarker[] {
  const ordered = points
    .map((point, index) => ({ point, index, x: (point.degreeInSign / 30) * 100 }))
    .sort((p, q) => p.x - q.x || p.index - q.index);

  const laneEnds: number[] = [];
  return ordered.map(({ point, x }) => {
    let lane = laneEnds.findIndex((end) => x - end >= gapPercent);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = x;
    return { point, x, lane };
  });
}

// ---- Chart context --------------------------------------------------------------------------

/** "33°56′S" style latitude or longitude; minutes are rounded because stored coordinates have 6 decimals. */
function formatCoordinate(value: number, positive: string, negative: string): string {
  const totalMinutes = Math.round(Math.abs(value) * 60);
  const degrees = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${degrees}°${String(minutes).padStart(2, "0")}′${value < 0 ? negative : positive}`;
}

export function formatCoordinates(lat: number, lng: number): string {
  return `${formatCoordinate(lat, "N", "S")} ${formatCoordinate(lng, "E", "W")}`;
}

/** "HH:mm" of an ISO instant in UTC. */
export function formatUtcTime(utcIso: string): string {
  const date = new Date(utcIso);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(11, 16);
}
