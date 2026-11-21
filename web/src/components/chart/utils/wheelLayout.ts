/**
 * Geometry of the natal wheel as plain data: where the degree ticks, the point label stacks, the
 * angle labels and the aspect lines go. The components only draw what these functions return, so the
 * numbers can be tested without rendering (REQ-001).
 */
import type {
  ChartAngles,
  ChartPosition,
  ChartResult,
  SharedAspect,
  SharedAspectType,
} from "@/types";
import {
  ANGLE_LABELS,
  CHART_LAYOUT,
  CUSP_ANGLE_TOLERANCE_DEG,
  OUTER_LABEL_GAP_DEG,
  POINT_LABEL_GAP_DEG,
  SCALE_TICK_LENGTH,
  ZODIAC_GLYPHS,
} from "./constants";
import { eclipticToSvgAngle, normalizeDegrees, polarToCartesian, signedAngleDelta } from "./chartMath";
import { spreadLabels } from "./labelSpread";
import { longitudeOfId, splitLongitude, type AngleId, type SignDegree } from "./positions";
import { pointGlyph } from "./viewModel";

export interface Point2D {
  x: number;
  y: number;
}

/** U+FE0E asks for the text form of a symbol, so the glyph takes the fill colour instead of a colour emoji. */
const TEXT_PRESENTATION = "\uFE0E";

/** The glyph of a zodiac sign for the wheel, in text presentation (the signs default to emoji in many fonts). */
export function signGlyph(sign: string): string {
  return `${ZODIAC_GLYPHS[sign] ?? ""}${TEXT_PRESENTATION}`;
}

// ---------------------------------------------------------------------------------------------
// Degree scale
// ---------------------------------------------------------------------------------------------

export type ScaleTickKind = "degree" | "five" | "ten";

export interface ScaleTick {
  /** Ecliptic longitude of the tick, a whole degree 0..359. */
  longitude: number;
  kind: ScaleTickKind;
  from: Point2D;
  to: Point2D;
}

/** One tick per degree, longer every 5 degrees and again every 10 degrees; they hang inwards from the sign band. */
export function degreeScaleTicks(rotation: number): ScaleTick[] {
  const { cx, cy, signInner } = CHART_LAYOUT;
  const ticks: ScaleTick[] = [];
  for (let longitude = 0; longitude < 360; longitude++) {
    const kind: ScaleTickKind = longitude % 10 === 0 ? "ten" : longitude % 5 === 0 ? "five" : "degree";
    const angle = eclipticToSvgAngle(longitude, rotation);
    ticks.push({
      longitude,
      kind,
      from: polarToCartesian(cx, cy, signInner, angle),
      to: polarToCartesian(cx, cy, signInner - SCALE_TICK_LENGTH[kind], angle),
    });
  }
  return ticks;
}

// ---------------------------------------------------------------------------------------------
// Houses
// ---------------------------------------------------------------------------------------------

/** Longitude in the middle of house `index` (0-based), between its cusp and the next one. */
export function houseMidLongitude(cusps: readonly number[], index: number): number {
  const start = cusps[index];
  const end = cusps[(index + 1) % cusps.length];
  return start + normalizeDegrees(end - start) / 2;
}

// ---------------------------------------------------------------------------------------------
// Points
// ---------------------------------------------------------------------------------------------

export interface PlacedPoint extends SignDegree {
  id: string;
  glyph: string;
  /** Exact longitude: where the tick on the ring is drawn. */
  lon: number;
  /** Longitude where the label stack is drawn; differs from `lon` when neighbours were spread apart. */
  displayLon: number;
  displaced: boolean;
  retrograde: boolean;
  house: number | null;
}

/** Offset below which a label counts as standing at its exact longitude. */
const DISPLACED_THRESHOLD_DEG = 0.05;

/** Every calculated point with its label position; no point is dropped (REQ-001). */
export function placePoints(positions: readonly ChartPosition[]): PlacedPoint[] {
  const spread = spreadLabels(
    positions.map((p) => ({ id: p.id, angle: p.lon })),
    POINT_LABEL_GAP_DEG,
  );
  return positions.map((p, index) => ({
    ...splitLongitude(p.lon),
    id: p.id,
    glyph: pointGlyph(p.id),
    lon: p.lon,
    displayLon: spread[index].position,
    displaced: Math.abs(spread[index].offset) > DISPLACED_THRESHOLD_DEG,
    retrograde: p.retrograde === true,
    house: p.house,
  }));
}

// ---------------------------------------------------------------------------------------------
// Angles
// ---------------------------------------------------------------------------------------------

export interface AngleEntry extends SignDegree {
  id: AngleId;
  label: string;
  lon: number;
}

/** ASC, DSC, MC and IC at their calculated longitudes. */
export function angleEntries(angles: ChartAngles): AngleEntry[] {
  const raw: Array<[AngleId, number]> = [
    ["ASC", angles.asc],
    ["DSC", angles.dsc],
    ["MC", angles.mc],
    ["IC", angles.ic],
  ];
  return raw.map(([id, lon]) => ({ id, label: ANGLE_LABELS[id], lon, ...splitLongitude(lon) }));
}

interface LabelBox {
  /** Half the width and half the height of the label block. */
  halfWidth: number;
  halfHeight: number;
  /** Gap between the sign band and the label block. */
  margin: number;
}

/** Angle label: name, degree with sign glyph, minute. */
const ANGLE_LABEL_BOX: LabelBox = { halfWidth: 22, halfHeight: 26, margin: 8 };
/** House cusp label: degree with sign glyph, minute. Smaller than the angle label. */
const CUSP_LABEL_BOX: LabelBox = { halfWidth: 18, halfHeight: 15, margin: 8 };

/** Centre of a label block in the margin outside the sign band, for a ray at `svgAngle`. */
function outsideLabelCenter(svgAngle: number, box: LabelBox): Point2D {
  const { cx, cy, outerRadius } = CHART_LAYOUT;
  const rad = (svgAngle * Math.PI) / 180;
  const reach = Math.abs(Math.cos(rad)) * box.halfWidth + Math.abs(Math.sin(rad)) * box.halfHeight;
  return polarToCartesian(cx, cy, outerRadius + box.margin + reach, svgAngle);
}

/** Centre of the angle label block outside the sign band, for an axis at `svgAngle`. */
export function angleLabelCenter(svgAngle: number): Point2D {
  return outsideLabelCenter(svgAngle, ANGLE_LABEL_BOX);
}

/** Centre of a house cusp label block outside the sign band, for a label at `svgAngle`. */
export function cuspLabelCenter(svgAngle: number): Point2D {
  return outsideLabelCenter(svgAngle, CUSP_LABEL_BOX);
}

/** Radius at which a cusp label block starts, measured from the wheel centre; the leader of a moved label ends here. */
export const CUSP_LABEL_START_RADIUS = CHART_LAYOUT.outerRadius + CUSP_LABEL_BOX.margin;

// ---------------------------------------------------------------------------------------------
// House cusp labels
// ---------------------------------------------------------------------------------------------

export interface CuspLabelEntry extends SignDegree {
  /** House number, 1 to 12. */
  house: number;
  /** Calculated cusp longitude. */
  lon: number;
  /** Longitude the label is drawn at; differs from `lon` only when the label had to make room. */
  displayLon: number;
  displaced: boolean;
}

/**
 * The labelled house cusps: all twelve, except a cusp that coincides with an angle (Koch and Placidus:
 * cusps 1, 4, 7 and 10 are ASC, IC, DSC and MC, whose label already shows the same value). The labels are
 * spread apart from each other and from the angle labels, which stay where they are, so none is hidden.
 */
export function cuspLabels(cusps: readonly number[], angles: ChartAngles): CuspLabelEntry[] {
  const angleLons = [angles.asc, angles.dsc, angles.mc, angles.ic];
  const kept = cusps
    .map((lon, index) => ({ house: index + 1, lon }))
    .filter((cusp) => angleLons.every((angle) => Math.abs(signedAngleDelta(angle, cusp.lon)) > CUSP_ANGLE_TOLERANCE_DEG));
  const spread = spreadLabels(
    [
      ...kept.map((cusp) => ({ id: `cusp-${cusp.house}`, angle: cusp.lon })),
      ...angleLons.map((lon, index) => ({ id: `angle-${index}`, angle: lon, fixed: true })),
    ],
    OUTER_LABEL_GAP_DEG,
  );
  return kept.map((cusp, index) => ({
    ...splitLongitude(cusp.lon),
    house: cusp.house,
    lon: cusp.lon,
    displayLon: spread[index].position,
    displaced: Math.abs(spread[index].offset) > DISPLACED_THRESHOLD_DEG,
  }));
}

// ---------------------------------------------------------------------------------------------
// Aspects
// ---------------------------------------------------------------------------------------------

export interface AspectSegment {
  key: string;
  a: string;
  b: string;
  type: SharedAspectType;
  major: boolean;
  exactness: number;
  from: Point2D;
  to: Point2D;
  mid: Point2D;
  /** Where the aspect glyph goes: the middle of the line, moved off the centre for diameters. */
  symbol: Point2D;
  length: number;
}

/** A chord closer than this to the wheel centre is nearly a diameter: its middle is the centre. */
const DIAMETER_DISTANCE = 24;
/** Where along such a chord (from its first end) the glyph goes, so that oppositions do not pile up at the centre. */
const DIAMETER_SYMBOL_POSITION = 0.3;

function symbolPoint(from: Point2D, to: Point2D, length: number): Point2D {
  const { cx, cy } = CHART_LAYOUT;
  // Distance of the wheel centre from the chord
  const distance = length === 0 ? 0 : Math.abs((to.x - from.x) * (from.y - cy) - (from.x - cx) * (to.y - from.y)) / length;
  const t = distance < DIAMETER_DISTANCE ? DIAMETER_SYMBOL_POSITION : 0.5;
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

/** Line weight grows with the tightness of the orb (exactness 0..1, 1 = exact). */
export function aspectStrokeWidth(exactness: number): number {
  return 0.8 + 3.2 * Math.min(1, Math.max(0, exactness));
}

export function aspectStrokeOpacity(exactness: number): number {
  return 0.35 + 0.55 * Math.min(1, Math.max(0, exactness));
}

/**
 * The aspect lines to draw: each aspect of `aspects` becomes a chord of the aspect circle between the
 * calculated longitudes of its two ends (a point or one of ASC, DSC, MC, IC). An aspect whose end has
 * no longitude (an angle without a birth time, Chiron when unavailable) is left out.
 */
export function aspectSegments(
  chart: ChartResult,
  aspects: readonly SharedAspect[],
  rotation: number,
): AspectSegment[] {
  const { cx, cy, aspectRadius } = CHART_LAYOUT;
  const segments: AspectSegment[] = [];
  for (const aspect of aspects) {
    const lonA = longitudeOfId(chart, aspect.a);
    const lonB = longitudeOfId(chart, aspect.b);
    if (lonA === null || lonB === null) continue;
    const from = polarToCartesian(cx, cy, aspectRadius, eclipticToSvgAngle(lonA, rotation));
    const to = polarToCartesian(cx, cy, aspectRadius, eclipticToSvgAngle(lonB, rotation));
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    segments.push({
      key: `${aspect.a}-${aspect.b}-${aspect.type}`,
      a: aspect.a,
      b: aspect.b,
      type: aspect.type,
      major: aspect.major,
      exactness: aspect.exactness,
      from,
      to,
      mid: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
      symbol: symbolPoint(from, to, length),
      length,
    });
  }
  return segments;
}

/** Ids connected to `focusId` by at least one of the given aspects, including `focusId` itself. */
export function connectedIds(focusId: string | null, aspects: readonly SharedAspect[]): Set<string> | null {
  if (focusId === null) return null;
  const ids = new Set<string>([focusId]);
  for (const aspect of aspects) {
    if (aspect.a === focusId) ids.add(aspect.b);
    else if (aspect.b === focusId) ids.add(aspect.a);
  }
  return ids;
}
