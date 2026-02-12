import { describe, it, expect } from 'vitest';
import { computeNatalChart, ComputeChartInput } from '../astro/chart';

/**
 * Reference chart: Albert Einstein
 * Born March 14, 1879, 11:30 AM in Ulm, Germany
 * Well-documented natal chart in astrological literature.
 */
const einsteinInput: ComputeChartInput = {
  birthDate: '1879-03-14',
  birthTime: '11:30',
  timeUnknown: false,
  lat: 48.4011,
  lng: 9.9876,
  timezone: 'Europe/Berlin',
  houseSystem: 'placidus',
};

/** Expected sign placements for Einstein's chart (well-established references) */
const expectedSigns: Record<string, string> = {
  Sun: 'Pisces',
  Moon: 'Sagittarius',
  Mercury: 'Aries',
  Venus: 'Aries',
  Mars: 'Capricorn',
  Jupiter: 'Aquarius',
  Saturn: 'Aries',
  Uranus: 'Virgo',
  Neptune: 'Taurus',
  Pluto: 'Taurus',
};

const VALID_ASPECT_TYPES = ['conjunction', 'opposition', 'trine', 'square', 'sextile'];

describe('computeNatalChart — Einstein reference chart', () => {
  const result = computeNatalChart(einsteinInput);

  // ---- a) Correct structure ----
  describe('structure', () => {
    it('has meta, points, houses, aspects properties', () => {
      expect(result).toHaveProperty('meta');
      expect(result).toHaveProperty('points');
      expect(result).toHaveProperty('houses');
      expect(result).toHaveProperty('aspects');
    });

    it('meta.houseSystem is "placidus"', () => {
      expect(result.meta.houseSystem).toBe('placidus');
    });

    it('meta.zodiac is "tropical"', () => {
      expect(result.meta.zodiac).toBe('tropical');
    });

    it('meta.timeUsed is "11:30"', () => {
      expect(result.meta.timeUsed).toBe('11:30');
    });

    it('meta.timezoneUsed is "Europe/Berlin"', () => {
      expect(result.meta.timezoneUsed).toBe('Europe/Berlin');
    });

    it('points has exactly 10 entries', () => {
      expect(result.points).toHaveLength(10);
    });

    it('houses.cusps has exactly 12 entries', () => {
      expect(result.houses.cusps).toHaveLength(12);
    });

    it('houses.asc is a number (not null)', () => {
      expect(result.houses.asc).not.toBeNull();
      expect(typeof result.houses.asc).toBe('number');
    });

    it('houses.mc is a number (not null)', () => {
      expect(result.houses.mc).not.toBeNull();
      expect(typeof result.houses.mc).toBe('number');
    });

    it('aspects is a non-empty array', () => {
      expect(Array.isArray(result.aspects)).toBe(true);
      expect(result.aspects.length).toBeGreaterThan(0);
    });
  });

  // ---- b) Correct sign placements ----
  describe('sign placements', () => {
    for (const [body, expectedSign] of Object.entries(expectedSigns)) {
      it(`${body} is in ${expectedSign}`, () => {
        const point = result.points.find((p) => p.body === body);
        expect(point).toBeDefined();
        expect(point!.sign).toBe(expectedSign);
      });
    }
  });

  // ---- c) Degree reasonableness ----
  describe('degree reasonableness', () => {
    it('all point longitudes are between 0 and 360', () => {
      for (const point of result.points) {
        expect(point.lon).toBeGreaterThanOrEqual(0);
        expect(point.lon).toBeLessThan(360);
      }
    });

    it('all degreeInSign values are between 0 and 30', () => {
      for (const point of result.points) {
        expect(point.degreeInSign).toBeGreaterThanOrEqual(0);
        expect(point.degreeInSign).toBeLessThan(30);
      }
    });

    it('all house numbers are between 1 and 12', () => {
      for (const point of result.points) {
        expect(point.house).toBeGreaterThanOrEqual(1);
        expect(point.house).toBeLessThanOrEqual(12);
      }
    });
  });

  // ---- d) House assignments ----
  describe('house assignments', () => {
    it('all 10 points have non-null house values', () => {
      for (const point of result.points) {
        expect(point.house).not.toBeNull();
      }
    });

    it('all house numbers are 1-12', () => {
      for (const point of result.points) {
        expect(point.house).toBeGreaterThanOrEqual(1);
        expect(point.house).toBeLessThanOrEqual(12);
      }
    });

    it('all house cusps are between 0 and 360', () => {
      for (const cusp of result.houses.cusps) {
        expect(cusp).toBeGreaterThanOrEqual(0);
        expect(cusp).toBeLessThan(360);
      }
    });

    it('ASC is between 0 and 360', () => {
      expect(result.houses.asc).toBeGreaterThanOrEqual(0);
      expect(result.houses.asc!).toBeLessThan(360);
    });

    it('MC is between 0 and 360', () => {
      expect(result.houses.mc).toBeGreaterThanOrEqual(0);
      expect(result.houses.mc!).toBeLessThan(360);
    });
  });

  // ---- e) Aspects ----
  describe('aspects', () => {
    it('each aspect has valid fields', () => {
      for (const aspect of result.aspects) {
        expect(typeof aspect.a).toBe('string');
        expect(typeof aspect.b).toBe('string');
        expect(VALID_ASPECT_TYPES).toContain(aspect.type);
        expect(aspect.orb).toBeGreaterThanOrEqual(0);
        expect(aspect.exactness).toBeGreaterThanOrEqual(0);
        expect(aspect.exactness).toBeLessThanOrEqual(1);
      }
    });

    it('aspects are sorted by exactness descending', () => {
      for (let i = 1; i < result.aspects.length; i++) {
        expect(result.aspects[i - 1].exactness).toBeGreaterThanOrEqual(
          result.aspects[i].exactness
        );
      }
    });

    it('no duplicate pairs (a-b should not also appear as b-a)', () => {
      const seen = new Set<string>();
      for (const aspect of result.aspects) {
        const key = [aspect.a, aspect.b].sort().join('|');
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    });
  });

  // ---- f) Reproducibility ----
  describe('reproducibility', () => {
    it('same input produces identical output', () => {
      const result1 = computeNatalChart(einsteinInput);
      const result2 = computeNatalChart(einsteinInput);
      expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
    });
  });

  // ---- g) timeUnknown mode ----
  describe('timeUnknown mode', () => {
    const timeUnknownResult = computeNatalChart({
      ...einsteinInput,
      timeUnknown: true,
    });

    it('houses.asc is null', () => {
      expect(timeUnknownResult.houses.asc).toBeNull();
    });

    it('houses.mc is null', () => {
      expect(timeUnknownResult.houses.mc).toBeNull();
    });

    it('all points have house: null', () => {
      for (const point of timeUnknownResult.points) {
        expect(point.house).toBeNull();
      }
    });

    it('aspects do NOT include ASC or MC as participants', () => {
      for (const aspect of timeUnknownResult.aspects) {
        expect(aspect.a).not.toBe('ASC');
        expect(aspect.a).not.toBe('MC');
        expect(aspect.b).not.toBe('ASC');
        expect(aspect.b).not.toBe('MC');
      }
    });
  });

  // ---- h) Whole Sign house system ----
  describe('Whole Sign house system', () => {
    const wholeSignResult = computeNatalChart({
      ...einsteinInput,
      houseSystem: 'whole-sign',
    });

    it('meta.houseSystem is "whole-sign"', () => {
      expect(wholeSignResult.meta.houseSystem).toBe('whole-sign');
    });

    it('house cusps are at 30-degree intervals', () => {
      const cusps = wholeSignResult.houses.cusps;
      for (let i = 0; i < 12; i++) {
        const nextIdx = (i + 1) % 12;
        let diff = cusps[nextIdx] - cusps[i];
        if (diff < 0) diff += 360;
        expect(diff).toBeCloseTo(30, 0);
      }
    });

    it('all 10 points have valid house assignments', () => {
      for (const point of wholeSignResult.points) {
        expect(point.house).not.toBeNull();
        expect(point.house).toBeGreaterThanOrEqual(1);
        expect(point.house).toBeLessThanOrEqual(12);
      }
    });
  });
});
