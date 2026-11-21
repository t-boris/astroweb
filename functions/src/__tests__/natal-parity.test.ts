import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { computeNatalChart, ComputeChartInput } from '../astro/chart';
import { CALC_VERSION, SHARED_ASPECT_DEFINITIONS } from '../astro/constants';
import { computeInputHash } from '../services/chart';
import type { ChartResult, SharedAspect } from '../types/index';
import {
  FIXTURE_DIR,
  chartInput,
  circularDeviation,
  insideArcsecondBin,
  loadAstroSeek,
  loadDatasets,
  loadHorizons,
  pairKey,
  referenceAspects,
  referenceCusps,
  referencePoints,
  toleranceArcseconds,
} from './helpers/natalParity';

/**
 * Numerical acceptance tests of REQ-005 for the natal chart.
 * The comparison rules (bin rule, tolerances, exclusions) are written down in
 * docs/verification/natal-chart-parity.md; the exclusions below are the entries of its section 6.
 */

const datasets = loadDatasets();
const horizons = loadHorizons();

/** ASC, DSC, MC and IC never form an aspect with each other. */
const ANGLE_IDS = new Set(['ASC', 'DSC', 'MC', 'IC']);
/** Points that Astro-Seek treats as moving with the sky rather than with a body. */
const ANGLE_LIKE_IDS = new Set(['ASC', 'DSC', 'MC', 'IC', 'Vertex', 'Fortune']);

const charts: Record<string, ChartResult> = {};
for (const ds of datasets) charts[ds.id] = computeNatalChart(chartInput(ds));

function positionById(chart: ChartResult, id: string) {
  const found = chart.positions?.find((p) => p.id === id);
  if (!found) throw new Error(`no position ${id}`);
  return found;
}

function longitudeOf(chart: ChartResult, id: string): number {
  if (id === 'ASC') return chart.angles!.asc;
  if (id === 'DSC') return chart.angles!.dsc;
  if (id === 'MC') return chart.angles!.mc;
  if (id === 'IC') return chart.angles!.ic;
  return positionById(chart, id).lon;
}

describe('input datasets', () => {
  it('the fixture UTC instants equal the instants AstroWeb calculates', () => {
    for (const ds of datasets) {
      expect(new Date(charts[ds.id].context!.utc).toISOString()).toBe(new Date(ds.utc).toISOString());
    }
  });

  it('every Astro-Seek capture was generated for the same UT instant', () => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (const ds of datasets) {
      for (const variant of ['default-orbs', 'fixed15-orbs'] as const) {
        const m = /Universal Time \(UT\/GMT\):(\d+) (\w{3}) (\d{4}) - (\d{2}):(\d{2})/.exec(
          loadAstroSeek(ds.id, variant).pageSettings
        );
        expect(m, `${ds.id} ${variant}`).not.toBeNull();
        const iso = new Date(Date.UTC(+m![3], months.indexOf(m![2]), +m![1], +m![4], +m![5])).toISOString();
        expect(iso, `${ds.id} ${variant}`).toBe(new Date(ds.utc).toISOString());
      }
    }
  });
});

describe('longitudes against Astro-Seek (arcsecond tables, section 3.2)', () => {
  for (const ds of datasets) {
    const reference = loadAstroSeek(ds.id, 'default-orbs');
    const points = referencePoints(reference);

    it(`${ds.id}: every listed point is inside its printed arcsecond bin`, () => {
      const chart = charts[ds.id];
      expect(points.length).toBe(17);
      for (const p of points) {
        const lon = longitudeOf(chart, p.id);
        expect(
          insideArcsecondBin(lon, p.shownArcseconds, toleranceArcseconds(p.id)),
          `${ds.id} ${p.id}: AstroWeb ${lon} vs shown ${p.shownArcseconds / 3600}`
        ).toBe(true);
      }
    });

    it(`${ds.id}: house cusps are inside their printed arcsecond bins`, () => {
      const cusps = referenceCusps(reference);
      expect(cusps).toHaveLength(12);
      cusps.forEach((shown, i) => {
        expect(
          insideArcsecondBin(charts[ds.id].houses.cusps[i], shown, 1.5),
          `${ds.id} cusp ${i + 1}: AstroWeb ${charts[ds.id].houses.cusps[i]} vs shown ${shown / 3600}`
        ).toBe(true);
      });
    });

    it(`${ds.id}: house number and retrograde marker match`, () => {
      for (const p of points) {
        if (p.house !== null) {
          expect(positionById(charts[ds.id], p.id).house, `${ds.id} ${p.id} house`).toBe(p.house);
        }
        if (p.id !== 'ASC' && p.id !== 'MC') {
          expect(positionById(charts[ds.id], p.id).retrograde, `${ds.id} ${p.id} retrograde`).toBe(p.retrograde);
        }
      }
    });
  }
});

describe('longitudes against JPL Horizons (section 3.3)', () => {
  const bodies = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
  for (const ds of datasets) {
    it(`${ds.id}: the ten bodies agree with the Horizons snapshot`, () => {
      for (const body of bodies) {
        const reference = horizons.bodies[body].longitudes[ds.id];
        const lon = positionById(charts[ds.id], body).lon;
        const tolerance = toleranceArcseconds(body) / 3600;
        expect(circularDeviation(lon, reference), `${ds.id} ${body}`).toBeLessThanOrEqual(tolerance);
      }
    });
  }
});

describe('longitudes against the original screenshots (display verification, section 3.2)', () => {
  const screenshots = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'screenshots.json'), 'utf8')) as Record<
    string,
    {
      points: [string, string, number, number, number, boolean | null][];
      angles: [string, string, number, number, number][];
    }
  >;
  const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];

  for (const id of ['A', 'B']) {
    it(`${id}: sign, degree, minute, house and retrograde marker equal the printed screenshot values`, () => {
      const chart = charts[id];
      const shown = screenshots[id];
      // Printed rows are truncated to the arcminute; the same truncation is applied to the AstroWeb longitude.
      const minutes = (lon: number) => Math.floor(lon * 60 + 1e-7);
      const printed = (sign: string, deg: number, min: number) => SIGNS.indexOf(sign) * 1800 + deg * 60 + min;

      for (const [pid, sign, deg, min, house, retro] of shown.points) {
        const p = positionById(chart, pid);
        expect(minutes(p.lon), `${id} ${pid}`).toBe(printed(sign, deg, min));
        expect(p.house, `${id} ${pid} house`).toBe(house);
        if (retro !== null) expect(p.retrograde, `${id} ${pid} retrograde`).toBe(retro);
      }
      for (const [aid, sign, deg, min] of shown.angles) {
        expect(minutes(longitudeOf(chart, aid)), `${id} ${aid}`).toBe(printed(sign, deg, min));
      }
      expect(positionById(chart, 'Pluto').house).toBe(id === 'A' ? 11 : 3);
    });
  }
});

describe('point conventions (DEC-010, DEC-016)', () => {
  it('the South Node is 180 degrees from the mean North Node and shares its retrograde marker', () => {
    for (const ds of datasets) {
      const north = positionById(charts[ds.id], 'NorthNode');
      const south = positionById(charts[ds.id], 'SouthNode');
      expect(circularDeviation(north.lon, south.lon)).toBeCloseTo(180, 9);
      expect(south.retrograde).toBe(north.retrograde);
      expect(north.retrograde).toBe(true); // the mean node always moves backwards
    }
  });

  it('Part of Fortune uses the day formula for the day chart B and the night formula for the night chart A', () => {
    const lon = (ds: string, id: string) => positionById(charts[ds], id).lon;
    const norm = (x: number) => ((x % 360) + 360) % 360;
    const dayB = norm(charts.B.angles!.asc + lon('B', 'Moon') - lon('B', 'Sun'));
    const nightA = norm(charts.A.angles!.asc + lon('A', 'Sun') - lon('A', 'Moon'));
    expect(circularDeviation(lon('B', 'Fortune'), dayB)).toBeLessThan(1e-9);
    expect(circularDeviation(lon('A', 'Fortune'), nightA)).toBeLessThan(1e-9);
  });

  it('Fortune and Vertex carry no motion data, every other point does', () => {
    for (const ds of datasets) {
      for (const p of charts[ds.id].positions!) {
        if (p.id === 'Fortune' || p.id === 'Vertex') {
          expect(p.retrograde).toBeNull();
          expect(p.speed).toBeNull();
        } else {
          expect(typeof p.retrograde).toBe('boolean');
          expect(typeof p.speed).toBe('number');
        }
      }
    }
  });
});

/** Longitudes of the reference chart in degrees, including the angles, to resolve ambiguous aspect codes. */
function referenceLongitudes(ds: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of referencePoints(loadAstroSeek(ds, 'default-orbs'))) out[p.id] = (p.shownArcseconds + 0.5) / 3600;
  out.DSC = (out.ASC + 180) % 360;
  out.IC = (out.MC + 180) % 360;
  return out;
}

/** The documented exclusions of section 6: Fortune-Vertex pairs (reference defect). */
function comparable(a: string, b: string): boolean {
  return !((a === 'Fortune' && b === 'Vertex') || (a === 'Vertex' && b === 'Fortune'));
}

describe('shared aspect set against Astro-Seek (DEC-011, DEC-017)', () => {
  for (const ds of datasets) {
    const longitudes = referenceLongitudes(ds.id);
    const defaults = referenceAspects(loadAstroSeek(ds.id, 'default-orbs'), longitudes).filter((x) =>
      comparable(x.a, x.b)
    );
    const fixed = referenceAspects(loadAstroSeek(ds.id, 'fixed15-orbs'), longitudes).filter((x) =>
      comparable(x.a, x.b)
    );
    const aspects = charts[ds.id].sharedAspects!.filter((x) => comparable(x.a, x.b));

    it(`${ds.id}: the set equals the Astro-Seek default-orb list`, () => {
      const mine = aspects.map((x) => `${pairKey(x.a, x.b)}|${x.type}`).sort();
      const theirs = defaults.map((x) => `${pairKey(x.a, x.b)}|${x.type}`).sort();
      expect(mine).toEqual(theirs);
    });

    it(`${ds.id}: the set is consistent with the Astro-Seek 15 degree list`, () => {
      // At 15 degrees Astro-Seek lists one type per pair, taking the first type of its list in angle order
      // (a pair 1 degree from a 135 degree aspect is listed as a trine at 14 degrees), so that list cannot be
      // filtered into an equal set. It still has to agree in both directions:
      const luminary = (id: string) => id === 'Sun' || id === 'Moon';
      const allowance = (a: string, b: string, type: string) => {
        const def = SHARED_ASPECT_DEFINITIONS.find((d) => d.type === type)!;
        return luminary(a) || luminary(b) ? def.luminaryOrb : def.orb;
      };
      const listed = new Map(fixed.map((x) => [pairKey(x.a, x.b), x]));
      const mineByPair = new Map(aspects.map((x) => [pairKey(x.a, x.b), x]));

      // 1. Everything AstroWeb reports is also reported by Astro-Seek for that pair, with the same type
      //    or, when an earlier type of its list takes the pair, with an orb that contains it.
      for (const x of aspects) {
        const ref = listed.get(pairKey(x.a, x.b));
        expect(ref, `${ds.id} ${x.a} ${x.type} ${x.b} missing in the 15 degree list`).toBeDefined();
        if (ref!.type === x.type) {
          expect(Math.abs(x.orb * 60 - ref!.shownOrbArcminutes)).toBeLessThan(1.05);
          expect(x.applying === null || ref!.applying === x.applying || ref!.shownOrbArcminutes < 1).toBe(true);
        }
      }

      // 2. Everything Astro-Seek lists inside the AstroWeb orb table is reported by AstroWeb, as the same type
      //    or as a closer one. A printed orb equal to the allowance is a boundary case (the print is truncated).
      for (const ref of fixed) {
        if (ref.shownOrbArcminutes >= allowance(ref.a, ref.b, ref.type) * 60) continue;
        const mine = mineByPair.get(pairKey(ref.a, ref.b));
        expect(mine, `${ds.id} ${ref.a} ${ref.type} ${ref.b} (${ref.shownOrbArcminutes}') missing in AstroWeb`).toBeDefined();
        if (mine!.type !== ref.type) {
          expect(mine!.orb * 60, `${ds.id} ${ref.a} ${ref.b}`).toBeLessThan(ref.shownOrbArcminutes);
        }
      }
    });

    it(`${ds.id}: orb magnitude, orb sign and applying or separating agree`, () => {
      const byKey = new Map<string, SharedAspect>(aspects.map((x) => [`${pairKey(x.a, x.b)}|${x.type}`, x]));
      for (const ref of defaults) {
        const mine = byKey.get(`${pairKey(ref.a, ref.b)}|${ref.type}`);
        expect(mine, `${ds.id} ${ref.a} ${ref.type} ${ref.b}`).toBeDefined();
        const minutes = mine!.orb * 60;
        expect(
          minutes >= ref.shownOrbArcminutes - 0.05 && minutes < ref.shownOrbArcminutes + 1 + 0.05,
          `${ds.id} ${ref.a} ${ref.type} ${ref.b}: AstroWeb ${minutes}' vs shown ${ref.shownOrbArcminutes}'`
        ).toBe(true);

        // The printed sign is actual minus exact angle, but the sign of a zero orb is not shown, and
        // the point order of a pair may differ, so only the sign of an orb above one arcminute is compared.
        if (ref.shownOrbArcminutes >= 1) {
          expect(mine!.signedOrb < 0, `${ds.id} ${ref.a} ${ref.type} ${ref.b} orb sign`).toBe(ref.negativeOrb);
        }

        // Pairs of two points of the daily rotation have no status (section 6, no single rule reproduces
        // the reference). An orb under one arcminute is a boundary case whose side the print does not decide.
        const bothDaily = ANGLE_LIKE_IDS.has(ref.a) && ANGLE_LIKE_IDS.has(ref.b);
        if (bothDaily) {
          expect(mine!.applying, `${ds.id} ${ref.a} ${ref.type} ${ref.b} applying`).toBeNull();
        } else if (ref.shownOrbArcminutes >= 1) {
          expect(mine!.applying, `${ds.id} ${ref.a} ${ref.type} ${ref.b} applying`).toBe(ref.applying);
        } else {
          expect(typeof mine!.applying).toBe('boolean');
        }
      }
    });

    it(`${ds.id}: no aspect between two angles and none for the South Node`, () => {
      for (const x of charts[ds.id].sharedAspects!) {
        expect(ANGLE_IDS.has(x.a) && ANGLE_IDS.has(x.b)).toBe(false);
        expect(x.a).not.toBe('SouthNode');
        expect(x.b).not.toBe('SouthNode');
      }
    });
  }
});

describe('legacy fields stay unchanged (DEC-014)', () => {
  const BASELINE_NUMBER_TOLERANCE_DEGREES = 1e-7;
  // Baseline written by origin/main e682fa3, before this feature, for the four datasets, the Einstein
  // chart and an unknown-time chart. points and aspects feed prompts, PDFs and transits.
  const baseline = JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIR, 'regression', 'legacy-chart-fields.json'), 'utf8')
  ) as {
    charts: Record<string, { input: ComputeChartInput; meta: ChartResult['meta']; points: ChartResult['points']; aspects: ChartResult['aspects']; houses: ChartResult['houses'] }>;
  };

  for (const [id, expected] of Object.entries(baseline.charts)) {
    it(`${id}: points and meta are identical to the baseline`, () => {
      const chart = computeNatalChart(expected.input);
      // The baseline was written on macOS and CI runs on Linux: the floating-point results of the
      // ephemeris differ in the twelfth decimal (about 1e-8 arcseconds). Compare the numbers with a
      // tolerance far below the arcsecond and everything else exactly.
      const withoutNumbers = (points: ChartResult['points']) =>
        points.map(({ lon: _lon, degreeInSign: _degreeInSign, ...rest }) => rest);
      expect(withoutNumbers(chart.points)).toEqual(withoutNumbers(expected.points));
      chart.points.forEach((point, i) => {
        const before = expected.points[i];
        expect(circularDeviation(point.lon, before.lon), `${id} ${point.body} lon`).toBeLessThan(BASELINE_NUMBER_TOLERANCE_DEGREES);
        expect(Math.abs(point.degreeInSign - before.degreeInSign), `${id} ${point.body} degreeInSign`).toBeLessThan(BASELINE_NUMBER_TOLERANCE_DEGREES);
      });
      expect(chart.meta).toEqual(expected.meta);
    });

    it(`${id}: aspects keep their pairs and types; only orbs to ASC or MC move by rounding (DEC-018)`, () => {
      const chart = computeNatalChart(expected.input);
      expect(chart.aspects.map((a) => `${a.a}|${a.b}|${a.type}`)).toEqual(
        expected.aspects.map((a) => `${a.a}|${a.b}|${a.type}`)
      );
      chart.aspects.forEach((aspect, i) => {
        const before = expected.aspects[i];
        const touchesAngle = ['ASC', 'MC'].includes(aspect.a) || ['ASC', 'MC'].includes(aspect.b);
        if (touchesAngle) {
          // The angles move by up to 6 arcseconds (0.002 degrees); the orb is printed with two decimals.
          expect(Math.abs(aspect.orb - before.orb)).toBeLessThanOrEqual(0.011);
          expect(Math.abs(aspect.exactness - before.exactness)).toBeLessThanOrEqual(0.003);
        } else {
          expect(aspect).toEqual(before);
        }
      });
    });

    it(`${id}: houses differ from the baseline by under 10 arcseconds (DEC-018, mean obliquity)`, () => {
      const chart = computeNatalChart(expected.input);
      expect(chart.houses.system).toBe(expected.houses.system);
      expect(chart.houses.cusps).toHaveLength(12);
      chart.houses.cusps.forEach((cusp, i) => {
        expect(circularDeviation(cusp, expected.houses.cusps[i]) * 3600, `${id} cusp ${i + 1}`).toBeLessThan(10);
      });
      if (expected.houses.asc === null) {
        expect(chart.houses.asc).toBeNull();
        expect(chart.houses.mc).toBeNull();
      } else {
        expect(circularDeviation(chart.houses.asc!, expected.houses.asc) * 3600).toBeLessThan(10);
        expect(circularDeviation(chart.houses.mc!, expected.houses.mc!) * 3600).toBeLessThan(10);
      }
    });
  }
});

describe('unknown birth time', () => {
  const chart = computeNatalChart({
    birthDate: '1990-06-15',
    birthTime: null,
    timeUnknown: true,
    lat: 51.5074,
    lng: -0.1278,
    timezone: 'Europe/London',
    houseSystem: 'placidus',
  });

  it('leaves out houses, angles, Fortune, Vertex and every aspect to an angle', () => {
    expect(chart.angles).toBeNull();
    expect(chart.context!.timeEstimated).toBe(true);
    expect(chart.positions!.some((p) => p.id === 'Fortune' || p.id === 'Vertex')).toBe(false);
    expect(chart.positions!.every((p) => p.house === null)).toBe(true);
    for (const x of chart.sharedAspects!) {
      expect(ANGLE_LIKE_IDS.has(x.a) || ANGLE_LIKE_IDS.has(x.b)).toBe(false);
    }
  });

  it('still calculates the bodies, both nodes, Lilith and Chiron', () => {
    for (const id of ['Sun', 'Moon', 'NorthNode', 'SouthNode', 'Lilith', 'Chiron']) {
      expect(positionById(chart, id).lon).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('Chiron range (DEC-015)', () => {
  const base = {
    birthTime: '12:00',
    timeUnknown: false,
    lat: 40,
    lng: -74,
    timezone: 'America/New_York',
    houseSystem: 'koch' as const,
  };

  it('is calculated inside the bundled range', () => {
    const chart = computeNatalChart({ ...base, birthDate: '1950-01-01' });
    expect(chart.context!.chironAvailable).toBe(true);
    expect(chart.positions!.some((p) => p.id === 'Chiron')).toBe(true);
  });

  it('is left out, without an error, before 1800 and after 2400', () => {
    for (const birthDate of ['1700-06-01', '2450-06-01']) {
      const chart = computeNatalChart({ ...base, birthDate });
      expect(chart.context!.chironAvailable, birthDate).toBe(false);
      expect(chart.positions!.some((p) => p.id === 'Chiron'), birthDate).toBe(false);
      expect(chart.positions!.some((p) => p.id === 'Sun'), birthDate).toBe(true);
    }
  });
});

describe('cache key and cached result (DEC-014, I-8)', () => {
  const inputs = {
    birthDate: '2002-03-30',
    birthTime: '03:30',
    lat: -33.933333,
    lng: 18.416667,
    timezone: 'Africa/Johannesburg',
    houseSystem: 'whole-sign',
  };

  it('the calculation version is part of the cache key', () => {
    const withVersion = computeInputHash(inputs);
    const legacyKey = [
      inputs.birthDate, inputs.birthTime, inputs.lat.toFixed(6), inputs.lng.toFixed(6), inputs.timezone, inputs.houseSystem,
    ].join('|');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createHash } = require('crypto') as typeof import('crypto');
    expect(withVersion).not.toBe(createHash('sha256').update(legacyKey).digest('hex'));
    expect(withVersion).toBe(createHash('sha256').update(`${legacyKey}|v${CALC_VERSION}`).digest('hex'));
  });

  it('a chart read back from storage equals a fresh calculation', () => {
    for (const ds of datasets) {
      const stored = JSON.parse(JSON.stringify(charts[ds.id])) as ChartResult;
      expect(stored).toEqual(computeNatalChart(chartInput(ds)));
      expect(stored.context!.calcVersion).toBe(CALC_VERSION);
    }
  });
});
