/**
 * The natal wheel of the PDF report, a pdfkit port of the wheel of the profile page.
 *
 * The geometry is the shared chart code (`../vendor/chart-core`, generated from packages/chart-core): the
 * same layout functions that place every element of the web wheel place it here, so house 1 stands at
 * 9 o'clock, the degree scale, house cusps, angles, points and aspect lines have the same positions and the
 * same label spreading. Only the colours differ: the PDF palette (cream paper, gold lines, dark text).
 *
 * `planNatalWheel` is pure: it returns a display list in the 1000-unit coordinates of the web viewBox. The
 * renderer maps those units onto the page with one transform, so line widths and font sizes in the list are
 * the web values. Unit tests read the display list; `drawNatalWheel` renders it.
 */
import {
  ALL_ASPECT_TYPES,
  CHART_LAYOUT,
  DEFAULT_ASPECT_TYPES,
  CUSP_LABEL_START_RADIUS,
  POINT_LABEL_RADII,
  SIGN_ELEMENTS,
  ZODIAC_GLYPHS,
  ZODIAC_SIGNS,
  angleEntries,
  angleLabelCenter,
  aspectSegments,
  aspectStrokeOpacity,
  aspectStrokeWidth,
  cuspLabelCenter,
  cuspLabels,
  degreeScaleTicks,
  describeSector,
  eclipticToSvgAngle,
  filterAspects,
  getAngles,
  getPositions,
  getSharedAspects,
  houseMidLongitude,
  isTimeEstimated,
  placePoints,
  polarToCartesian,
  wheelRotation,
} from "../vendor/chart-core";
import type { ChartResult } from "../types";

export const SITE_URL = "https://natalmystic.com";

export type WheelLanguage = "en" | "ru";
export type WheelFont = "sans" | "sansBold" | "symbols";

/** Font names of the PDF document that the wheel uses (see registerFonts in pdf.ts). */
export interface WheelFonts {
  sans: string;
  sansBold: string;
  symbols: string;
}

export type WheelLayer =
  | "background"
  | "zodiac"
  | "scale"
  | "houses"
  | "cusp-labels"
  | "aspects"
  | "angles"
  | "points";

interface PrimitiveBase {
  layer: WheelLayer;
  /** Stable name for tests, for example `cusp-1` or `point-Sun`. */
  id?: string;
}

export interface LinePrimitive extends PrimitiveBase {
  kind: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  opacity?: number;
  dash?: [number, number];
}

export interface CirclePrimitive extends PrimitiveBase {
  kind: "circle";
  cx: number;
  cy: number;
  r: number;
  fill?: string;
  stroke?: string;
  width?: number;
  opacity?: number;
}

/** A closed or open SVG path in viewBox units (the sign sectors, the degree scale ticks). */
export interface PathPrimitive extends PrimitiveBase {
  kind: "path";
  d: string;
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  width?: number;
  opacity?: number;
}

export interface TextSegment {
  text: string;
  font: WheelFont;
  size: number;
  color: string;
}

/** One or more text segments on one line, centred together on (x, y); the vertical centre is the middle of the line box. */
export interface TextPrimitive extends PrimitiveBase {
  kind: "text";
  x: number;
  y: number;
  segments: TextSegment[];
  /** Space between segments in viewBox units. */
  gap?: number;
  opacity?: number;
}

/** A glyph that the symbol font does not have (the Sun U+2609, the Part of Fortune U+2297): drawn as vector shapes. */
export interface SymbolPrimitive extends PrimitiveBase {
  kind: "symbol";
  symbol: "sun" | "fortune";
  x: number;
  y: number;
  /** The font size the glyph stands for; the drawing is about 0.7 of it high. */
  size: number;
  color: string;
}

export type WheelPrimitive =
  | LinePrimitive
  | CirclePrimitive
  | PathPrimitive
  | TextPrimitive
  | SymbolPrimitive;

export interface LegendAspect {
  type: string;
  label: string;
  color: string;
  major: boolean;
}

export interface WheelPlan {
  /** Longitude drawn on the left (9 o'clock) axis. */
  rotation: number;
  /** True when the birth time is unknown: no houses, cusps or angles. */
  estimated: boolean;
  primitives: WheelPrimitive[];
  /** The aspect types that were drawn, majors first. */
  legend: LegendAspect[];
}

// ---------------------------------------------------------------------------------------------
// Palette (the PDF palette: cream paper, gold lines, dark text)
// ---------------------------------------------------------------------------------------------

export const WHEEL_COLORS = {
  paper: "#FFFBF3",
  gold: "#B9862C",
  deepGold: "#7C5318",
  line: "#D8C39D",
  lineStrong: "#A98A52",
  text: "#24201B",
  muted: "#6E6257",
  angle: "#8B5E20",
  tick: "#336A9E",
  retrograde: "#A13E34",
} as const;

const ELEMENT_STYLE = {
  fire: { fill: "#F2C9B5", text: "#A8402A" },
  earth: { fill: "#D8E4C2", text: "#456B2C" },
  air: { fill: "#F2E6B5", text: "#8A6A12" },
  water: { fill: "#C9DDEA", text: "#2B5F86" },
} as const;

/** Aspect colours that stay legible on the cream page. The five majors keep the colours of the PDF aspects page. */
export const PDF_ASPECT_COLORS: Record<string, string> = {
  conjunction: "#9B6B2E",
  opposition: "#7A4A8E",
  trine: "#336A9E",
  square: "#A13E34",
  sextile: "#3E7C59",
  "semi-sextile": "#6F7F8C",
  "semi-square": "#C0702A",
  quintile: "#2A8F84",
  sesquiquadrate: "#A87B12",
  "bi-quintile": "#1F7E9A",
  quincunx: "#8E5BA8",
};

const ASPECT_NAMES: Record<string, Record<WheelLanguage, string>> = {
  conjunction: { en: "Conjunction", ru: "Соединение" },
  opposition: { en: "Opposition", ru: "Оппозиция" },
  trine: { en: "Trine", ru: "Тригон" },
  square: { en: "Square", ru: "Квадратура" },
  sextile: { en: "Sextile", ru: "Секстиль" },
  "semi-sextile": { en: "Semi-sextile", ru: "Полусекстиль" },
  "semi-square": { en: "Semi-square", ru: "Полуквадрат" },
  quintile: { en: "Quintile", ru: "Квинтиль" },
  sesquiquadrate: { en: "Sesquiquadrate", ru: "Полутораквадрат" },
  "bi-quintile": { en: "Bi-quintile", ru: "Биквинтиль" },
  quincunx: { en: "Quincunx", ru: "Квинконс" },
};

// ---------------------------------------------------------------------------------------------
// Sizes taken from the web layers (viewBox units)
// ---------------------------------------------------------------------------------------------

const RING_TICK = 9;
const INNER_TICK = 7;
const GLYPH_HALF = 16;
const RETROGRADE_OFFSET = 21;
const RAD_TO_DEG = 180 / Math.PI;
const CUSP_MARK_LENGTH = 4;
const CUSP_LINE_STEP = 15;
const ANGLE_LINE_STEP = 17;
const MINOR_DASH: [number, number] = [6, 5];

const SCALE_STYLE = {
  degree: { opacity: 0.4, width: 0.8 },
  five: { opacity: 0.65, width: 1.1 },
  ten: { opacity: 0.95, width: 1.6 },
} as const;

function textOf(
  text: string,
  font: WheelFont,
  size: number,
  color: string,
): TextSegment {
  return { text, font, size, color };
}

function line(
  layer: WheelLayer,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  width: number,
  extra: Partial<LinePrimitive> = {},
): LinePrimitive {
  return { kind: "line", layer, x1: from.x, y1: from.y, x2: to.x, y2: to.y, color, width, ...extra };
}

// ---------------------------------------------------------------------------------------------
// The display list
// ---------------------------------------------------------------------------------------------

/**
 * Everything the wheel draws, back to front: background disc, sign band, degree scale, houses, cusp labels,
 * aspect lines, angle axes, points. `aspectTypes` limits the aspect types; the default is what the site wheel shows when
 * it opens (the five major aspects), so the report reads like the profile page.
 */
export function planNatalWheel(
  chart: ChartResult,
  language: WheelLanguage,
  aspectTypes: readonly string[] = DEFAULT_ASPECT_TYPES,
): WheelPlan {
  const { cx, cy, size, outerRadius, signInner, zodiacInner, houseOuter, houseInner, houseRingOuter, houseNumberRadius } =
    CHART_LAYOUT;
  const estimated = isTimeEstimated(chart);
  const rotation = wheelRotation(chart);
  const angles = estimated ? null : getAngles(chart);
  const cusps = estimated || chart.houses.cusps.length !== 12 ? null : chart.houses.cusps;
  const primitives: WheelPrimitive[] = [];

  // Background disc: it also covers the decorative sketch that the page theme draws behind the wheel.
  primitives.push({
    kind: "circle",
    layer: "background",
    id: "background",
    cx,
    cy,
    r: size / 2,
    fill: WHEEL_COLORS.paper,
    stroke: WHEEL_COLORS.gold,
    width: 2,
  });

  // Sign band: twelve element-tinted sectors, their glyphs and the outer border.
  ZODIAC_SIGNS.forEach((sign, index) => {
    const start = eclipticToSvgAngle(index * 30, rotation);
    const end = eclipticToSvgAngle((index + 1) * 30, rotation);
    const style = ELEMENT_STYLE[SIGN_ELEMENTS[sign]];
    primitives.push({
      kind: "path",
      layer: "zodiac",
      id: `sector-${sign}`,
      d: describeSector(cx, cy, signInner, outerRadius, start, end),
      fill: style.fill,
      fillOpacity: 0.7,
      stroke: WHEEL_COLORS.lineStrong,
      width: 1.4,
    });
  });
  ZODIAC_SIGNS.forEach((sign, index) => {
    const mid = eclipticToSvgAngle(index * 30 + 15, rotation);
    const at = polarToCartesian(cx, cy, (outerRadius + signInner) / 2, mid);
    const style = ELEMENT_STYLE[SIGN_ELEMENTS[sign]];
    primitives.push({
      kind: "text",
      layer: "zodiac",
      id: `sign-${sign}`,
      x: at.x,
      y: at.y,
      segments: [textOf(ZODIAC_GLYPHS[sign], "symbols", 28, style.text)],
    });
  });
  primitives.push({
    kind: "circle",
    layer: "zodiac",
    id: "outer-border",
    cx,
    cy,
    r: outerRadius,
    stroke: WHEEL_COLORS.gold,
    width: 1.8,
  });

  // Degree scale: one tick per degree, three paths (one per tick length) like the web layer.
  primitives.push(
    { kind: "circle", layer: "scale", id: "sign-inner", cx, cy, r: signInner, stroke: WHEEL_COLORS.lineStrong, width: 1 },
    { kind: "circle", layer: "scale", id: "zodiac-inner", cx, cy, r: zodiacInner, stroke: WHEEL_COLORS.lineStrong, width: 1 },
  );
  const ticks = degreeScaleTicks(rotation);
  for (const kind of ["degree", "five", "ten"] as const) {
    const d = ticks
      .filter((tick) => tick.kind === kind)
      .map((tick) => `M${tick.from.x.toFixed(2)} ${tick.from.y.toFixed(2)}L${tick.to.x.toFixed(2)} ${tick.to.y.toFixed(2)}`)
      .join("");
    primitives.push({
      kind: "path",
      layer: "scale",
      id: `scale-${kind}`,
      d,
      stroke: WHEEL_COLORS.deepGold,
      width: SCALE_STYLE[kind].width,
      opacity: SCALE_STYLE[kind].opacity,
    });
  }

  // Houses: number ring, cusp lines, numbers, inner circle. Without a birth time only the inner circle.
  if (cusps) {
    primitives.push({
      kind: "circle",
      layer: "houses",
      id: "house-ring",
      cx,
      cy,
      r: houseRingOuter,
      stroke: WHEEL_COLORS.lineStrong,
      width: 1.2,
    });
    cusps.forEach((cusp, index) => {
      const angle = eclipticToSvgAngle(cusp, rotation);
      primitives.push(
        line(
          "houses",
          polarToCartesian(cx, cy, houseOuter, angle),
          polarToCartesian(cx, cy, houseInner, angle),
          WHEEL_COLORS.deepGold,
          1.5,
          { id: `cusp-${index + 1}` },
        ),
      );
    });
    cusps.forEach((_, index) => {
      const mid = eclipticToSvgAngle(houseMidLongitude(cusps, index), rotation);
      const at = polarToCartesian(cx, cy, houseNumberRadius, mid);
      primitives.push({
        kind: "text",
        layer: "houses",
        id: `house-number-${index + 1}`,
        x: at.x,
        y: at.y,
        segments: [textOf(String(index + 1), "sans", 15, WHEEL_COLORS.muted)],
      });
    });
  }
  primitives.push({
    kind: "circle",
    layer: "houses",
    id: "inner-circle",
    cx,
    cy,
    r: houseInner,
    stroke: WHEEL_COLORS.gold,
    width: 1,
  });

  // Longitude of every house cusp outside the sign band.
  if (cusps && angles) {
    for (const label of cuspLabels(cusps, angles)) {
      const exact = eclipticToSvgAngle(label.lon, rotation);
      const shown = eclipticToSvgAngle(label.displayLon, rotation);
      const markEnd = polarToCartesian(cx, cy, outerRadius + CUSP_MARK_LENGTH, exact);
      primitives.push(
        line("cusp-labels", polarToCartesian(cx, cy, zodiacInner, exact), markEnd, WHEEL_COLORS.lineStrong, 1, {
          id: `cusp-extension-${label.house}`,
          opacity: 0.8,
        }),
      );
      if (label.displaced) {
        primitives.push(
          line("cusp-labels", markEnd, polarToCartesian(cx, cy, CUSP_LABEL_START_RADIUS, shown), WHEEL_COLORS.muted, 0.8, {
            id: `cusp-leader-${label.house}`,
            dash: [2, 2],
          }),
        );
      }
      const center = cuspLabelCenter(shown);
      const style = ELEMENT_STYLE[SIGN_ELEMENTS[label.sign]];
      primitives.push(
        {
          kind: "text",
          layer: "cusp-labels",
          id: `cusp-label-${label.house}-degree`,
          x: center.x,
          y: center.y - CUSP_LINE_STEP / 2,
          gap: 2,
          segments: [
            textOf(`${label.degree}°`, "sans", 13, WHEEL_COLORS.muted),
            textOf(ZODIAC_GLYPHS[label.sign], "symbols", 14, style.text),
          ],
        },
        {
          kind: "text",
          layer: "cusp-labels",
          id: `cusp-label-${label.house}-minute`,
          x: center.x,
          y: center.y + CUSP_LINE_STEP / 2,
          segments: [textOf(`${String(label.minute).padStart(2, "0")}′`, "sans", 13, WHEEL_COLORS.muted)],
        },
      );
    }
  }

  // Aspect lines from the shared set; the majors are solid, the minors dashed.
  const aspects = filterAspects(getSharedAspects(chart), new Set(aspectTypes));
  const segments = aspectSegments(chart, aspects, rotation);
  for (const segment of segments) {
    primitives.push(
      line("aspects", segment.from, segment.to, PDF_ASPECT_COLORS[segment.type] ?? WHEEL_COLORS.muted, aspectStrokeWidth(segment.exactness), {
        id: `aspect-${segment.key}`,
        opacity: aspectStrokeOpacity(segment.exactness),
        dash: segment.major ? undefined : MINOR_DASH,
      }),
    );
  }
  const drawnTypes = new Set(segments.map((segment) => segment.type));
  const legend: LegendAspect[] = ALL_ASPECT_TYPES.filter((type) => drawnTypes.has(type as never)).map((type) => ({
    type,
    label: ASPECT_NAMES[type]?.[language] ?? type,
    color: PDF_ASPECT_COLORS[type] ?? WHEEL_COLORS.muted,
    major: !segments.some((segment) => segment.type === type && !segment.major),
  }));

  // The four angle axes with their labels.
  if (angles) {
    for (const entry of angleEntries(angles)) {
      const svgAngle = eclipticToSvgAngle(entry.lon, rotation);
      const inner = polarToCartesian(cx, cy, houseInner, svgAngle);
      const scaleEnd = polarToCartesian(cx, cy, signInner, svgAngle);
      const ringEnd = polarToCartesian(cx, cy, outerRadius + 2, svgAngle);
      const center = angleLabelCenter(svgAngle);
      const style = ELEMENT_STYLE[SIGN_ELEMENTS[entry.sign]];
      primitives.push(
        line("angles", inner, scaleEnd, WHEEL_COLORS.angle, 3.2, { id: `angle-${entry.id}` }),
        line("angles", scaleEnd, ringEnd, WHEEL_COLORS.angle, 1.2, { id: `angle-${entry.id}-pointer`, opacity: 0.6 }),
        {
          kind: "text",
          layer: "angles",
          id: `angle-${entry.id}-name`,
          x: center.x,
          y: center.y - ANGLE_LINE_STEP,
          segments: [textOf(entry.label, "sansBold", 15, WHEEL_COLORS.angle)],
        },
        {
          kind: "text",
          layer: "angles",
          id: `angle-${entry.id}-degree`,
          x: center.x,
          y: center.y,
          gap: 2,
          segments: [
            textOf(`${entry.degree}°`, "sans", 15, WHEEL_COLORS.text),
            textOf(ZODIAC_GLYPHS[entry.sign], "symbols", 16, style.text),
          ],
        },
        {
          kind: "text",
          layer: "angles",
          id: `angle-${entry.id}-minute`,
          x: center.x,
          y: center.y + ANGLE_LINE_STEP,
          segments: [textOf(`${String(entry.minute).padStart(2, "0")}′`, "sans", 15, WHEEL_COLORS.text)],
        },
      );
    }
  }

  // Every calculated point: ticks, leader, glyph, retrograde marker, degree, sign glyph, minute.
  for (const point of placePoints(getPositions(chart))) {
    const exact = eclipticToSvgAngle(point.lon, rotation);
    const shown = eclipticToSvgAngle(point.displayLon, rotation);
    const ringTickStart = polarToCartesian(cx, cy, zodiacInner, exact);
    const ringTickEnd = polarToCartesian(cx, cy, zodiacInner - RING_TICK, exact);
    const style = ELEMENT_STYLE[SIGN_ELEMENTS[point.sign]];
    const glyphAt = polarToCartesian(cx, cy, POINT_LABEL_RADII.glyph, shown);
    const glyphSize = point.glyph.length > 1 ? 19 : 28;

    primitives.push(
      line("points", ringTickStart, ringTickEnd, WHEEL_COLORS.tick, 2.2, { id: `tick-ring-${point.id}` }),
      line(
        "points",
        polarToCartesian(cx, cy, houseInner, exact),
        polarToCartesian(cx, cy, houseInner + INNER_TICK, exact),
        WHEEL_COLORS.tick,
        1.6,
        { id: `tick-inner-${point.id}` },
      ),
      line("points", ringTickEnd, polarToCartesian(cx, cy, POINT_LABEL_RADII.glyph + GLYPH_HALF, shown), WHEEL_COLORS.tick, point.displaced ? 1 : 0.8, {
        id: `leader-${point.id}`,
        opacity: 0.55,
        dash: point.displaced ? [3, 2] : undefined,
      }),
    );

    if (point.id === "Sun") {
      primitives.push({ kind: "symbol", layer: "points", id: `glyph-${point.id}`, symbol: "sun", x: glyphAt.x, y: glyphAt.y, size: glyphSize, color: WHEEL_COLORS.text });
    } else if (point.id === "Fortune") {
      primitives.push({ kind: "symbol", layer: "points", id: `glyph-${point.id}`, symbol: "fortune", x: glyphAt.x, y: glyphAt.y, size: glyphSize, color: WHEEL_COLORS.text });
    } else {
      primitives.push({
        kind: "text",
        layer: "points",
        id: `glyph-${point.id}`,
        x: glyphAt.x,
        y: glyphAt.y,
        segments: [textOf(point.glyph, point.glyph.length > 1 ? "sansBold" : "symbols", glyphSize, WHEEL_COLORS.text)],
      });
    }

    if (point.retrograde) {
      const at = polarToCartesian(cx, cy, POINT_LABEL_RADII.glyph, shown + (RETROGRADE_OFFSET / POINT_LABEL_RADII.glyph) * RAD_TO_DEG);
      primitives.push({
        kind: "text",
        layer: "points",
        id: `retrograde-${point.id}`,
        x: at.x,
        y: at.y,
        segments: [textOf("R", "sansBold", 13, WHEEL_COLORS.retrograde)],
      });
    }

    const degreeAt = polarToCartesian(cx, cy, POINT_LABEL_RADII.degree, shown);
    const signAt = polarToCartesian(cx, cy, POINT_LABEL_RADII.sign, shown);
    const minuteAt = polarToCartesian(cx, cy, POINT_LABEL_RADII.minute, shown);
    primitives.push(
      { kind: "text", layer: "points", id: `degree-${point.id}`, x: degreeAt.x, y: degreeAt.y, segments: [textOf(`${point.degree}°`, "sans", 16, WHEEL_COLORS.text)] },
      { kind: "text", layer: "points", id: `sign-${point.id}`, x: signAt.x, y: signAt.y, segments: [textOf(ZODIAC_GLYPHS[point.sign], "symbols", 16, style.text)] },
      { kind: "text", layer: "points", id: `minute-${point.id}`, x: minuteAt.x, y: minuteAt.y, segments: [textOf(`${String(point.minute).padStart(2, "0")}′`, "sans", 16, WHEEL_COLORS.text)] },
    );
  }

  return { rotation, estimated, primitives, legend };
}

// ---------------------------------------------------------------------------------------------
// Placing the wheel on the page
// ---------------------------------------------------------------------------------------------

/** Where the 1000-unit square of the wheel stands on the page: its top-left corner and its side in points. */
export interface WheelFrame {
  left: number;
  top: number;
  /** Side of the square in points. */
  side: number;
  /** Points per viewBox unit. */
  scale: number;
}

/** Space kept free at the left and right of the wheel page. */
export const WHEEL_SIDE_MARGIN = 24;
/** Space kept free under the wheel for the legend, the site link and the page footer. */
export const WHEEL_BELOW_RESERVE = 120;

/** The largest wheel side that fits a page: the full width between the side margins, or the height left under `top`. */
export function wheelSide(pageWidth: number, pageHeight: number, top: number): number {
  return Math.min(pageWidth - 2 * WHEEL_SIDE_MARGIN, pageHeight - top - WHEEL_BELOW_RESERVE);
}

/** A wheel `side` points wide, centred on `centerX`, with its top edge at `top`. */
export function wheelFrame(centerX: number, top: number, side: number): WheelFrame {
  return { left: centerX - side / 2, top, side, scale: side / CHART_LAYOUT.size };
}

/** Page coordinates of a point given in viewBox units. */
export function toPage(frame: WheelFrame, point: { x: number; y: number }): { x: number; y: number } {
  return { x: frame.left + point.x * frame.scale, y: frame.top + point.y * frame.scale };
}

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------

function drawText(doc: PDFKit.PDFDocument, primitive: TextPrimitive, fonts: WheelFonts): void {
  const gap = primitive.gap ?? 0;
  const widths = primitive.segments.map((segment) => {
    doc.font(fonts[segment.font]).fontSize(segment.size);
    return doc.widthOfString(segment.text);
  });
  const total = widths.reduce((sum, width) => sum + width, 0) + gap * (primitive.segments.length - 1);
  let x = primitive.x - total / 2;
  primitive.segments.forEach((segment, index) => {
    doc.font(fonts[segment.font]).fontSize(segment.size);
    const height = doc.currentLineHeight();
    doc
      .fillColor(segment.color)
      .fillOpacity(primitive.opacity ?? 1)
      .text(segment.text, x, primitive.y - height / 2, { lineBreak: false });
    x += widths[index] + gap;
  });
}

function drawSymbol(doc: PDFKit.PDFDocument, primitive: SymbolPrimitive): void {
  const radius = primitive.size * 0.34;
  const stroke = Math.max(1.4, primitive.size * 0.075);
  doc.lineWidth(stroke).strokeColor(primitive.color).fillColor(primitive.color);
  doc.circle(primitive.x, primitive.y, radius).stroke();
  if (primitive.symbol === "sun") {
    doc.circle(primitive.x, primitive.y, stroke * 0.9).fill();
    return;
  }
  const arm = radius * 0.707;
  doc
    .moveTo(primitive.x - arm, primitive.y - arm)
    .lineTo(primitive.x + arm, primitive.y + arm)
    .moveTo(primitive.x + arm, primitive.y - arm)
    .lineTo(primitive.x - arm, primitive.y + arm)
    .stroke();
}

function drawPrimitive(doc: PDFKit.PDFDocument, primitive: WheelPrimitive, fonts: WheelFonts): void {
  doc.save();
  switch (primitive.kind) {
    case "line": {
      doc.opacity(primitive.opacity ?? 1).lineCap("round").lineWidth(primitive.width).strokeColor(primitive.color);
      if (primitive.dash) doc.dash(primitive.dash[0], { space: primitive.dash[1] });
      doc.moveTo(primitive.x1, primitive.y1).lineTo(primitive.x2, primitive.y2).stroke();
      break;
    }
    case "circle": {
      doc.opacity(primitive.opacity ?? 1);
      if (primitive.width !== undefined) doc.lineWidth(primitive.width);
      doc.circle(primitive.cx, primitive.cy, primitive.r);
      if (primitive.fill && primitive.stroke) doc.fillAndStroke(primitive.fill, primitive.stroke);
      else if (primitive.fill) doc.fill(primitive.fill);
      else doc.stroke(primitive.stroke ?? WHEEL_COLORS.line);
      break;
    }
    case "path": {
      doc.opacity(primitive.opacity ?? 1);
      if (primitive.width !== undefined) doc.lineWidth(primitive.width);
      doc.path(primitive.d);
      if (primitive.fill && primitive.stroke) {
        doc.fillOpacity(primitive.fillOpacity ?? 1).fillAndStroke(primitive.fill, primitive.stroke);
      } else if (primitive.fill) {
        doc.fillOpacity(primitive.fillOpacity ?? 1).fill(primitive.fill);
      } else {
        doc.stroke(primitive.stroke ?? WHEEL_COLORS.line);
      }
      break;
    }
    case "text":
      drawText(doc, primitive, fonts);
      break;
    case "symbol":
      drawSymbol(doc, primitive);
      break;
  }
  doc.restore();
}

/**
 * Draw the wheel into `frame`. Returns the plan so that the caller can print the legend of the aspect
 * types that were drawn. The text cursor of the document is left where it was.
 */
export function drawNatalWheel(
  doc: PDFKit.PDFDocument,
  chart: ChartResult,
  language: WheelLanguage,
  frame: WheelFrame,
  fonts: WheelFonts,
  aspectTypes?: readonly string[],
): WheelPlan {
  const plan = planNatalWheel(chart, language, aspectTypes);
  const previousX = doc.x;
  const previousY = doc.y;
  doc.save();
  doc.translate(frame.left, frame.top).scale(frame.scale);
  for (const primitive of plan.primitives) drawPrimitive(doc, primitive, fonts);
  doc.restore();
  doc.x = previousX;
  doc.y = previousY;
  return plan;
}

// ---------------------------------------------------------------------------------------------
// Caption, legend and site link (page coordinates, not scaled)
// ---------------------------------------------------------------------------------------------

function wheelCaption(language: WheelLanguage, estimated: boolean): string {
  if (estimated) {
    return language === "ru"
      ? "Время рождения неизвестно: положения рассчитаны на местный полдень, дома, куспиды и углы карты не показаны."
      : "Birth time unknown: positions are calculated for local noon; houses, cusps and chart angles are not drawn.";
  }
  return language === "ru"
    ? "Внешнее кольцо - знаки и шкала градусов, внутреннее - дома 1-12, золотые оси - ASC, DSC, MC, IC, линии внутри - аспекты."
    : "Outer ring: signs and degree scale; inner ring: houses 1-12; gold axes: ASC, DSC, MC, IC; inner lines: aspects.";
}

/**
 * The caption and the colour key of the aspect types that were drawn, centred in `width` from `y`.
 * Returns the y below the legend.
 */
export function drawWheelLegend(
  doc: PDFKit.PDFDocument,
  plan: WheelPlan,
  language: WheelLanguage,
  fonts: { sans: string },
  x: number,
  y: number,
  width: number,
): number {
  const previousX = doc.x;
  const previousY = doc.y;
  doc
    .font(fonts.sans)
    .fontSize(7.5)
    .fillColor(WHEEL_COLORS.muted)
    .text(wheelCaption(language, plan.estimated), x, y, { width, align: "center", lineGap: 1.5 });
  let cursorY = doc.y + 5;

  const swatch = 16;
  const gap = 12;
  const labelGap = 4;
  doc.font(fonts.sans).fontSize(7.5);
  const items = plan.legend.map((item) => ({ item, width: swatch + labelGap + doc.widthOfString(item.label) }));
  const rows: Array<typeof items> = [[]];
  let rowWidth = 0;
  for (const entry of items) {
    const next = rowWidth === 0 ? entry.width : rowWidth + gap + entry.width;
    if (next > width && rows[rows.length - 1].length > 0) {
      rows.push([entry]);
      rowWidth = entry.width;
    } else {
      rows[rows.length - 1].push(entry);
      rowWidth = next;
    }
  }
  for (const row of rows) {
    if (row.length === 0) continue;
    const total = row.reduce((sum, entry) => sum + entry.width, 0) + gap * (row.length - 1);
    let cursorX = x + (width - total) / 2;
    for (const { item, width: itemWidth } of row) {
      doc.save().lineWidth(1.6).strokeColor(item.color).lineCap("round");
      if (!item.major) doc.dash(3, { space: 2.5 });
      doc.moveTo(cursorX, cursorY + 4).lineTo(cursorX + swatch, cursorY + 4).stroke();
      doc.restore();
      doc
        .font(fonts.sans)
        .fontSize(7.5)
        .fillColor(WHEEL_COLORS.text)
        .text(item.label, cursorX + swatch + labelGap, cursorY, { lineBreak: false });
      cursorX += itemWidth + gap;
    }
    cursorY += 12;
  }
  doc.x = previousX;
  doc.y = previousY;
  return cursorY;
}

/** The site link, centred in `width` from `y`, clickable. Returns the y below it. */
export function drawSiteLink(
  doc: PDFKit.PDFDocument,
  fonts: { sansBold: string },
  x: number,
  y: number,
  width: number,
  color: string,
  size = 10,
): number {
  const previousX = doc.x;
  const previousY = doc.y;
  doc.font(fonts.sansBold).fontSize(size).fillColor(color);
  // Centred, underlined and linked by hand, drawn without a text box: a box makes pdfkit start a new page when
  // the line would end inside the bottom margin, which would put the link alone on the next page.
  const textWidth = doc.widthOfString(SITE_URL);
  const lineHeight = doc.currentLineHeight();
  const left = x + (width - textWidth) / 2;
  doc.text(SITE_URL, left, y, { lineBreak: false });
  const underlineY = y + lineHeight - 1.5;
  doc.save().lineWidth(0.6).strokeColor(color).moveTo(left, underlineY).lineTo(left + textWidth, underlineY).stroke().restore();
  doc.link(left, y, textWidth, lineHeight, SITE_URL);
  const bottom = y + lineHeight;
  doc.x = previousX;
  doc.y = previousY;
  return bottom;
}
