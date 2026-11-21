import fs from 'fs';
import PDFDocument from 'pdfkit';
import { createRequire } from 'module';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { computeNatalChart } from '../astro/chart';
import { generateInterpretationPdf } from '../services/pdf';
import {
  PDF_ASPECT_COLORS,
  SITE_URL,
  WHEEL_COLORS,
  drawNatalWheel,
  drawSiteLink,
  drawWheelLegend,
  planNatalWheel,
  toPage,
  wheelFrame,
  wheelSide,
  type CirclePrimitive,
  type LinePrimitive,
  type PathPrimitive,
  type TextPrimitive,
  type WheelPlan,
  type WheelPrimitive,
} from '../services/pdfWheel';
import { ALL_ASPECT_TYPES, CHART_LAYOUT, getPositions, getSharedAspects } from '../vendor/chart-core';
import type { ChartResult } from '../types';
import { chartInput, loadDatasets } from './helpers/natalParity';

/**
 * The PDF wheel (services/pdfWheel.ts): the display list built from the shared chart code, the page
 * mapping, and the generated PDF with its site links.
 */

const datasets = loadDatasets();
const datasetA = datasets.find((d) => d.id === 'A')!;
const knownChart: ChartResult = computeNatalChart({ ...chartInput(datasetA), houseSystem: 'koch' });
const wholeSignChart: ChartResult = computeNatalChart({ ...chartInput(datasetA), houseSystem: 'whole-sign' });
const unknownChart: ChartResult = computeNatalChart({ ...chartInput(datasetA), birthTime: null, timeUnknown: true });
/** A chart as the calculation before version 2 produced it: no positions, angles, shared aspects or context. */
const legacyChart: ChartResult = (() => {
  const { positions, angles, sharedAspects, context, ...rest } = knownChart;
  void positions;
  void angles;
  void sharedAspects;
  void context;
  return rest as ChartResult;
})();

const { cx, cy, houseOuter } = CHART_LAYOUT;

function byId<T extends WheelPrimitive = WheelPrimitive>(plan: WheelPlan, id: string): T | undefined {
  return plan.primitives.find((p) => p.id === id) as T | undefined;
}

function idsWithPrefix(plan: WheelPlan, prefix: string): string[] {
  return plan.primitives.filter((p) => p.id?.startsWith(prefix)).map((p) => p.id!);
}

describe('wheel display list: a chart with a birth time', () => {
  const plan = planNatalWheel(knownChart, 'en');

  it('draws house 1 on the 9 o\'clock axis', () => {
    expect(plan.estimated).toBe(false);
    expect(plan.rotation).toBeCloseTo(knownChart.houses.cusps[0], 10);
    const cusp1 = byId<LinePrimitive>(plan, 'cusp-1')!;
    expect(cusp1.x1).toBeCloseTo(cx - houseOuter, 6);
    expect(cusp1.y1).toBeCloseTo(cy, 6);
    // The cusp line runs from the sign band inwards, along the horizontal axis.
    expect(cusp1.x2).toBeGreaterThan(cusp1.x1);
    expect(cusp1.y2).toBeCloseTo(cy, 6);
  });

  it('draws the zodiac counter-clockwise: house 2 is below the axis, house 12 above it', () => {
    const cusp2 = byId<LinePrimitive>(plan, 'cusp-2')!;
    const cusp12 = byId<LinePrimitive>(plan, 'cusp-12')!;
    expect(cusp2.y1).toBeGreaterThan(cy);
    expect(cusp12.y1).toBeLessThan(cy);
  });

  it('draws the lines that divide the circle dark enough to see on the cream page', () => {
    // The house cusps and the sign boundaries were drawn in the light `line` colour at width 1 and vanished on paper.
    const cusps = idsWithPrefix(plan, 'cusp-').filter((id) => /^cusp-\d+$/.test(id));
    expect(cusps).toHaveLength(12);
    for (const id of cusps) {
      const cusp = byId<LinePrimitive>(plan, id)!;
      expect(cusp.color, id).toBe(WHEEL_COLORS.deepGold);
      expect(cusp.width, id).toBeGreaterThanOrEqual(1.5);
      expect(cusp.opacity ?? 1, id).toBe(1);
    }
    for (const id of idsWithPrefix(plan, 'sector-')) {
      const sector = byId<PathPrimitive>(plan, id)!;
      expect(sector.stroke, id).not.toBe(WHEEL_COLORS.line);
      expect(sector.width, id).toBeGreaterThanOrEqual(1.4);
    }
    expect(byId<CirclePrimitive>(plan, 'house-ring')!.stroke).not.toBe(WHEEL_COLORS.line);
  });

  it('draws twelve cusps, twelve house numbers, four angle axes and the cusp labels', () => {
    expect(idsWithPrefix(plan, 'cusp-').filter((id) => /^cusp-\d+$/.test(id))).toHaveLength(12);
    expect(idsWithPrefix(plan, 'house-number-')).toHaveLength(12);
    for (const angle of ['ASC', 'DSC', 'MC', 'IC']) {
      expect(byId(plan, `angle-${angle}`)).toBeDefined();
      expect(byId(plan, `angle-${angle}-name`)).toBeDefined();
    }
    // Koch: cusps 1, 4, 7 and 10 coincide with the angles and are labelled by them.
    expect(idsWithPrefix(plan, 'cusp-label-').filter((id) => id.endsWith('-degree'))).toHaveLength(8);
  });

  it('puts ASC on the left axis (Koch)', () => {
    const asc = byId<LinePrimitive>(plan, 'angle-ASC')!;
    expect(asc.x2).toBeCloseTo(cx - CHART_LAYOUT.signInner, 6);
    expect(asc.y2).toBeCloseTo(cy, 6);
  });

  it('in Whole Sign house 1 starts at the left axis while ASC stays at its own longitude', () => {
    const wsPlan = planNatalWheel(wholeSignChart, 'en');
    const cusp1 = byId<LinePrimitive>(wsPlan, 'cusp-1')!;
    expect(cusp1.x1).toBeCloseTo(cx - houseOuter, 6);
    expect(cusp1.y1).toBeCloseTo(cy, 6);
    const asc = byId<LinePrimitive>(wsPlan, 'angle-ASC')!;
    expect(Math.abs(asc.y2 - cy)).toBeGreaterThan(1);
    // No cusp coincides with an angle in Whole Sign: all twelve are labelled.
    expect(idsWithPrefix(wsPlan, 'cusp-label-').filter((id) => id.endsWith('-degree'))).toHaveLength(12);
  });

  it('draws every calculated point with a glyph, degree, sign and minute, and every retrograde marker', () => {
    const positions = getPositions(knownChart);
    expect(positions.length).toBeGreaterThanOrEqual(15);
    for (const position of positions) {
      expect(byId(plan, `glyph-${position.id}`), position.id).toBeDefined();
      expect(byId(plan, `degree-${position.id}`), position.id).toBeDefined();
      expect(byId(plan, `sign-${position.id}`), position.id).toBeDefined();
      expect(byId(plan, `minute-${position.id}`), position.id).toBeDefined();
      expect(byId(plan, `tick-ring-${position.id}`), position.id).toBeDefined();
    }
    const retrograde = positions.filter((p) => p.retrograde === true).map((p) => `retrograde-${p.id}`).sort();
    expect(idsWithPrefix(plan, 'retrograde-').sort()).toEqual(retrograde);
    expect(retrograde.length).toBeGreaterThan(0);
  });

  it('draws the Sun and the Part of Fortune as vector shapes and the rest as symbol-font text', () => {
    expect(byId(plan, 'glyph-Sun')!.kind).toBe('symbol');
    expect(byId(plan, 'glyph-Fortune')!.kind).toBe('symbol');
    const moon = byId<TextPrimitive>(plan, 'glyph-Moon')!;
    expect(moon.kind).toBe('text');
    expect(moon.segments[0].font).toBe('symbols');
    const vertex = byId<TextPrimitive>(plan, 'glyph-Vertex')!;
    expect(vertex.segments[0].text).toBe('Vx');
  });

  it('uses only characters that the font of each text segment has (no missing-glyph boxes)', () => {
    const requireFromHere = createRequire(__filename);
    const fontkit = requireFromHere('fontkit') as {
      openSync(file: string): { hasGlyphForCodePoint(codePoint: number): boolean };
    };
    const dir = path.resolve(__dirname, '../../assets/fonts');
    const files = { sans: 'NotoSans-Regular.ttf', sansBold: 'NotoSans-Bold.ttf', symbols: 'NotoSansSymbols-Regular.ttf' };
    const fonts = Object.fromEntries(
      Object.entries(files).map(([key, file]) => [key, fontkit.openSync(path.join(dir, file))]),
    );
    const plans = [plan, planNatalWheel(unknownChart, 'en'), planNatalWheel(legacyChart, 'en')];
    let checked = 0;
    for (const { primitives } of plans) {
      for (const primitive of primitives) {
        if (primitive.kind !== 'text') continue;
        for (const segment of primitive.segments) {
          expect(segment.text).not.toMatch(/\uFE0E|\uFE0F/);
          for (const char of segment.text) {
            expect(fonts[segment.font].hasGlyphForCodePoint(char.codePointAt(0)!), `${primitive.id}: U+${char.codePointAt(0)!.toString(16)} in ${segment.font}`).toBe(true);
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('draws the degree scale as one path per tick length with a tick for every degree', () => {
    const ticks = (id: string) => (byId<PathPrimitive>(plan, id)!.d.match(/M/g) ?? []).length;
    expect(ticks('scale-ten')).toBe(36);
    expect(ticks('scale-five')).toBe(36);
    expect(ticks('scale-degree')).toBe(288);
  });

  it('draws the major aspects by default, like the site wheel when it opens', () => {
    const shared = getSharedAspects(knownChart).filter((a) => a.major);
    const lines = plan.primitives.filter((p): p is LinePrimitive => p.kind === 'line' && p.layer === 'aspects');
    expect(lines).toHaveLength(shared.length);
    expect(lines.length).toBeGreaterThan(0);
    for (const aspect of shared) {
      const drawn = byId<LinePrimitive>(plan, `aspect-${aspect.a}-${aspect.b}-${aspect.type}`)!;
      expect(drawn, `${aspect.a}-${aspect.b}-${aspect.type}`).toBeDefined();
      expect(drawn.color).toBe(PDF_ASPECT_COLORS[aspect.type]);
      expect(drawn.dash).toBeUndefined();
    }
    expect(plan.legend.every((l) => l.major)).toBe(true);
    expect(plan.legend.map((l) => l.type)).toContain('conjunction');
  });

  it('draws the whole shared set when asked: majors solid, minors dashed, in the PDF colours', () => {
    const shared = getSharedAspects(knownChart);
    const all = planNatalWheel(knownChart, 'en', ALL_ASPECT_TYPES);
    const lines = all.primitives.filter((p): p is LinePrimitive => p.kind === 'line' && p.layer === 'aspects');
    expect(lines).toHaveLength(shared.length);
    expect(shared.some((a) => !a.major)).toBe(true);
    for (const aspect of shared) {
      const drawn = byId<LinePrimitive>(all, `aspect-${aspect.a}-${aspect.b}-${aspect.type}`)!;
      expect(drawn, `${aspect.a}-${aspect.b}-${aspect.type}`).toBeDefined();
      expect(drawn.color).toBe(PDF_ASPECT_COLORS[aspect.type]);
      expect(drawn.dash !== undefined).toBe(!aspect.major);
    }
  });

  it('limits the aspect types when asked', () => {
    const only = planNatalWheel(knownChart, 'en', ['trine']);
    const lines = only.primitives.filter((p): p is LinePrimitive => p.kind === 'line' && p.layer === 'aspects');
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => l.id?.endsWith('-trine') === true)).toBe(true);
    expect(only.legend.map((l) => l.type)).toEqual(['trine']);
  });

  it('names the aspect types of the legend in the requested language', () => {
    const ru = planNatalWheel(knownChart, 'ru');
    expect(ru.legend.find((l) => l.type === 'trine')!.label).toBe('Тригон');
    expect(plan.legend.find((l) => l.type === 'trine')!.label).toBe('Trine');
  });
});

describe('wheel display list: a chart without a birth time', () => {
  const plan = planNatalWheel(unknownChart, 'en');

  it('draws 0 degrees Aries on the left axis and no houses, cusps or angles', () => {
    expect(plan.estimated).toBe(true);
    expect(plan.rotation).toBe(0);
    expect(idsWithPrefix(plan, 'cusp')).toHaveLength(0);
    expect(idsWithPrefix(plan, 'house-number-')).toHaveLength(0);
    expect(idsWithPrefix(plan, 'angle-')).toHaveLength(0);
    expect(byId(plan, 'house-ring')).toBeUndefined();
    // The inner circle is always drawn.
    expect(byId(plan, 'inner-circle')).toBeDefined();
  });

  it('starts the zodiac at the left axis and runs it counter-clockwise (Aries below it)', () => {
    const aries = byId<TextPrimitive>(plan, 'sign-Aries')!;
    expect(aries.x).toBeLessThan(cx);
    expect(aries.y).toBeGreaterThan(cy);
    const libra = byId<TextPrimitive>(plan, 'sign-Libra')!;
    expect(libra.x).toBeGreaterThan(cx);
  });

  it('still draws the calculated points and the aspects between them', () => {
    const positions = getPositions(unknownChart);
    expect(positions.length).toBeGreaterThanOrEqual(13);
    for (const position of positions) expect(byId(plan, `glyph-${position.id}`)).toBeDefined();
    const lines = plan.primitives.filter((p) => p.kind === 'line' && p.layer === 'aspects');
    expect(lines.length).toBeGreaterThan(0);
    // No aspect has an angle at its end.
    expect(plan.primitives.some((p) => p.id?.startsWith('aspect-') && /-(ASC|DSC|MC|IC)-|-(ASC|DSC|MC|IC)$/.test(p.id))).toBe(false);
  });
});

describe('wheel display list: a chart without the additive fields (calculation version 1)', () => {
  it('draws through the view-model fallbacks', () => {
    expect(legacyChart.positions).toBeUndefined();
    const plan = planNatalWheel(legacyChart, 'en');
    for (const body of ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']) {
      expect(byId(plan, `glyph-${body}`), body).toBeDefined();
    }
    // The angles come from the houses; the five major aspects come from the legacy list.
    expect(byId(plan, 'angle-ASC')).toBeDefined();
    expect(byId(plan, 'angle-MC')).toBeDefined();
    const lines = plan.primitives.filter((p): p is LinePrimitive => p.kind === 'line' && p.layer === 'aspects');
    expect(lines).toHaveLength(legacyChart.aspects.length);
    expect(lines.every((l) => l.dash === undefined)).toBe(true);
  });
});

describe('placing the wheel on the page', () => {
  const frame = wheelFrame(306, 100, 500);

  it('maps the 1000-unit square onto the page square', () => {
    expect(frame.scale).toBeCloseTo(0.5, 10);
    expect(frame.left).toBe(56);
    expect(toPage(frame, { x: cx, y: cy })).toEqual({ x: 306, y: 350 });
    expect(toPage(frame, { x: 0, y: 0 })).toEqual({ x: 56, y: 100 });
    expect(toPage(frame, { x: 1000, y: 1000 })).toEqual({ x: 556, y: 600 });
  });

  it('puts the house 1 cusp at 9 o\'clock on the page', () => {
    const plan = planNatalWheel(knownChart, 'en');
    const cusp1 = byId<LinePrimitive>(plan, 'cusp-1')!;
    const outer = toPage(frame, { x: cusp1.x1, y: cusp1.y1 });
    const centre = toPage(frame, { x: cx, y: cy });
    expect(outer.y).toBeCloseTo(centre.y, 6);
    expect(outer.x).toBeCloseTo(centre.x - houseOuter * frame.scale, 6);
  });

  it('keeps the whole wheel, labels included, inside the square', () => {
    const plan = planNatalWheel(knownChart, 'en');
    const reach = CHART_LAYOUT.size / 2;
    const disc = byId(plan, 'background') as { r: number };
    expect(disc.r).toBe(reach);
    for (const primitive of plan.primitives) {
      if (primitive.kind !== 'text') continue;
      const distance = Math.hypot(primitive.x - cx, primitive.y - cy);
      expect(distance, primitive.id).toBeLessThan(reach);
    }
  });
});

describe('the generated PDF', () => {
  const report = (chart?: ChartResult) => ({
    title: 'Premium Interpretation',
    subtitle: 'Prepared for a test',
    language: 'en' as const,
    sections: [{ title: 'Section', body: 'Body text.' }],
    chart,
  });
  const count = (buffer: Buffer, needle: string) => buffer.toString('latin1').split(needle).length - 1;
  const link = `/URI (${SITE_URL})`;

  it('is a valid PDF with the wheel page for a chart with a birth time', async () => {
    const buffer = await generateInterpretationPdf(report(knownChart));
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.subarray(-6).toString()).toContain('%%EOF');
    // The cover and the wheel page each carry the clickable link.
    expect(count(buffer, link)).toBe(2);
    // The symbol font is embedded.
    expect(buffer.toString('latin1')).toMatch(/\/BaseFont \/[A-Z]+\+NotoSansSymbols-Regular/);
  });

  it('is a valid PDF for a chart without a birth time, in Russian', async () => {
    const buffer = await generateInterpretationPdf({ ...report(unknownChart), language: 'ru' });
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(count(buffer, link)).toBe(2);
  });

  it('is a valid PDF for a chart without the additive fields', async () => {
    const buffer = await generateInterpretationPdf(report(legacyChart));
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(count(buffer, link)).toBe(2);
  });

  it('keeps the link on the cover when there is no chart', async () => {
    const buffer = await generateInterpretationPdf(report());
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(count(buffer, link)).toBe(1);
  });
});

describe('the font assets', () => {
  it('ships the symbols font with its licence next to the other fonts', () => {
    const dir = path.resolve(__dirname, '../../assets/fonts');
    expect(fs.existsSync(path.join(dir, 'NotoSansSymbols-Regular.ttf'))).toBe(true);
    const licence = fs.readFileSync(path.join(dir, 'OFL-NotoSansSymbols.txt'), 'utf8');
    expect(licence).toContain('SIL Open Font License');
  });
});

describe('the wheel page layout', () => {
  // The report page: US Letter with the margins of generateInterpretationPdf. A wheel that is too large pushes the
  // legend or the site link past the bottom margin, and pdfkit then starts a new page for it.
  const PAGE_WIDTH = 612;
  const PAGE_HEIGHT = 792;
  const MARGINS = { top: 54, left: 54, right: 54, bottom: 78 };
  const dir = path.resolve(__dirname, '../../assets/fonts');

  function drawWheelPage(chart: ChartResult, language: 'en' | 'ru', aspectTypes?: readonly string[], top = 110) {
    const doc = new PDFDocument({ size: 'LETTER', margins: MARGINS, bufferPages: true });
    doc.registerFont('Sans', path.join(dir, 'NotoSans-Regular.ttf'));
    doc.registerFont('SansBold', path.join(dir, 'NotoSans-Bold.ttf'));
    doc.registerFont('Symbols', path.join(dir, 'NotoSansSymbols-Regular.ttf'));
    const fonts = { sans: 'Sans', sansBold: 'SansBold', symbols: 'Symbols' };
    const side = wheelSide(PAGE_WIDTH, PAGE_HEIGHT, top);
    const frame = wheelFrame(PAGE_WIDTH / 2, top, side);
    const plan = drawNatalWheel(doc, chart, language, frame, fonts, aspectTypes);
    const contentWidth = PAGE_WIDTH - MARGINS.left - MARGINS.right;
    const legendBottom = drawWheelLegend(doc, plan, language, fonts, MARGINS.left, frame.top + frame.side + 8, contentWidth);
    const linkBottom = drawSiteLink(doc, fonts, MARGINS.left, legendBottom + 6, contentWidth, WHEEL_COLORS.deepGold);
    const pages = doc.bufferedPageRange().count;
    doc.end();
    return { pages, side, linkBottom, wheelBottom: frame.top + frame.side };
  }

  it('makes the wheel as large as the page allows and keeps the legend and the link under it', () => {
    const { side, wheelBottom, linkBottom } = drawWheelPage(knownChart, 'en');
    expect(side).toBeGreaterThan(540);
    expect(side).toBeLessThanOrEqual(PAGE_WIDTH - 40);
    expect(wheelBottom).toBeLessThanOrEqual(PAGE_HEIGHT - 110);
    expect(linkBottom).toBeLessThan(PAGE_HEIGHT - 40);
  });

  it.each([
    ['English, known time', knownChart, 'en'],
    ['Russian, known time', knownChart, 'ru'],
    ['Russian, unknown time', unknownChart, 'ru'],
    ['English, legacy chart', legacyChart, 'en'],
  ] as const)('draws the wheel, the legend and the link on one page: %s', (_name, chart, language) => {
    expect(drawWheelPage(chart, language).pages).toBe(1);
    // A section title that sits lower pushes the wheel down: it shrinks instead of overflowing.
    expect(drawWheelPage(chart, language, undefined, 150).pages).toBe(1);
  });

  it('keeps the link on the page with the whole aspect set drawn (legend of three rows)', () => {
    expect(drawWheelPage(knownChart, 'ru', ALL_ASPECT_TYPES).pages).toBe(1);
  });
});

