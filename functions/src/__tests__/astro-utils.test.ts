import { describe, it, expect } from 'vitest';
import { angularDifference, detectAspect, detectAllAspects } from '../astro/aspects';
import { longitudeToZodiac } from '../astro/zodiac';
import { findHouseForLongitude } from '../astro/houses';
import { computeInputHash } from '../services/chart';

// ============================================================
// angularDifference
// ============================================================
describe('angularDifference', () => {
  it('returns 180 for opposition (0, 180)', () => {
    expect(angularDifference(0, 180)).toBe(180);
  });

  it('returns 20 for wrap-around (350, 10)', () => {
    expect(angularDifference(350, 10)).toBe(20);
  });

  it('returns 20 for reverse wrap-around (10, 350)', () => {
    expect(angularDifference(10, 350)).toBe(20);
  });

  it('returns 0 for same point (0, 0)', () => {
    expect(angularDifference(0, 0)).toBe(0);
  });

  it('returns 180 for opposition via wrap (90, 270)', () => {
    expect(angularDifference(90, 270)).toBe(180);
  });

  it('returns 0 for identical points (180, 180)', () => {
    expect(angularDifference(180, 180)).toBe(0);
  });
});

// ============================================================
// detectAspect
// ============================================================
describe('detectAspect', () => {
  it('detects exact conjunction', () => {
    const result = detectAspect('Sun', 100, 'Moon', 100);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('conjunction');
    expect(result!.orb).toBe(0);
    expect(result!.exactness).toBe(1);
  });

  it('detects exact trine', () => {
    const result = detectAspect('Sun', 0, 'Moon', 120);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('trine');
    expect(result!.orb).toBe(0);
    expect(result!.exactness).toBe(1);
  });

  it('detects trine with orb', () => {
    const result = detectAspect('Sun', 0, 'Moon', 124);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('trine');
    expect(result!.orb).toBe(4);
    expect(result!.exactness).toBeCloseTo(0.33, 1);
  });

  it('returns null for non-major aspect (45 degrees)', () => {
    const result = detectAspect('Sun', 0, 'Moon', 45);
    expect(result).toBeNull();
  });

  it('detects aspect at orb boundary (exactly 6 degrees)', () => {
    const result = detectAspect('Sun', 0, 'Moon', 126);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('trine');
    expect(result!.exactness).toBe(0);
  });

  it('returns null beyond orb (7 degrees from trine)', () => {
    const result = detectAspect('Sun', 0, 'Moon', 127);
    expect(result).toBeNull();
  });

  it('detects opposition with wrap-around', () => {
    const result = detectAspect('Sun', 5, 'Moon', 185);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('opposition');
  });
});

// ============================================================
// detectAllAspects
// ============================================================
describe('detectAllAspects', () => {
  it('detects aspects among 3 points and sorts by exactness', () => {
    const points = [
      { name: 'Sun', lon: 0 },
      { name: 'Moon', lon: 120 },   // trine to Sun (exact)
      { name: 'Mars', lon: 182 },   // opposition to Sun (2 deg orb)
    ];
    const aspects = detectAllAspects(points);
    expect(aspects.length).toBeGreaterThanOrEqual(1);
    // Most exact aspect should be first
    for (let i = 1; i < aspects.length; i++) {
      expect(aspects[i - 1].exactness).toBeGreaterThanOrEqual(aspects[i].exactness);
    }
  });

  it('returns empty array for empty input', () => {
    expect(detectAllAspects([])).toEqual([]);
  });

  it('returns empty array for single point', () => {
    expect(detectAllAspects([{ name: 'Sun', lon: 0 }])).toEqual([]);
  });
});

// ============================================================
// longitudeToZodiac
// ============================================================
describe('longitudeToZodiac', () => {
  it('converts 0 degrees to Aries 0', () => {
    const result = longitudeToZodiac(0);
    expect(result.sign).toBe('Aries');
    expect(result.degreeInSign).toBe(0);
  });

  it('converts 30 degrees to Taurus 0', () => {
    const result = longitudeToZodiac(30);
    expect(result.sign).toBe('Taurus');
    expect(result.degreeInSign).toBe(0);
  });

  it('converts 29.99 degrees to Aries ~29.99', () => {
    const result = longitudeToZodiac(29.99);
    expect(result.sign).toBe('Aries');
    expect(result.degreeInSign).toBeCloseTo(29.99, 1);
  });

  it('converts 90 degrees to Cancer 0', () => {
    const result = longitudeToZodiac(90);
    expect(result.sign).toBe('Cancer');
    expect(result.degreeInSign).toBe(0);
  });

  it('converts 359.99 degrees to Pisces ~29.99', () => {
    const result = longitudeToZodiac(359.99);
    expect(result.sign).toBe('Pisces');
    expect(result.degreeInSign).toBeCloseTo(29.99, 1);
  });

  it('normalizes negative longitude (-10 -> Pisces 20)', () => {
    const result = longitudeToZodiac(-10);
    expect(result.sign).toBe('Pisces');
    expect(result.degreeInSign).toBeCloseTo(20, 0);
  });

  it('normalizes longitude over 360 (370 -> Aries 10)', () => {
    const result = longitudeToZodiac(370);
    expect(result.sign).toBe('Aries');
    expect(result.degreeInSign).toBeCloseTo(10, 0);
  });
});

// ============================================================
// findHouseForLongitude
// ============================================================
describe('findHouseForLongitude', () => {
  // Standard cusps evenly spaced at 30-degree intervals starting at 0
  const evenCusps = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

  it('places planet at 15 degrees in house 1 (even cusps)', () => {
    expect(findHouseForLongitude(15, evenCusps)).toBe(1);
  });

  it('handles wrap-around: planet at 355 degrees in house 12', () => {
    // cusps[11]=330, cusps[0]=0, so 355 is between 330 and 0 (wrap)
    expect(findHouseForLongitude(355, evenCusps)).toBe(12);
  });

  it('planet exactly on a cusp belongs to that house', () => {
    // Planet at 30 degrees should be in house 2 (cusps[1]=30, cusps[2]=60)
    expect(findHouseForLongitude(30, evenCusps)).toBe(2);
  });

  it('handles wrap-around cusps correctly', () => {
    // Cusps where house 12 crosses 0 degrees
    const wrappedCusps = [350, 20, 50, 80, 110, 140, 170, 200, 230, 260, 290, 320];
    // Planet at 355 is between cusp[0]=350 and cusp[1]=20, so house 1
    expect(findHouseForLongitude(355, wrappedCusps)).toBe(1);
    // Planet at 5 is between cusp[0]=350 and cusp[1]=20, so house 1
    expect(findHouseForLongitude(5, wrappedCusps)).toBe(1);
  });
});

// ============================================================
// computeInputHash
// ============================================================
describe('computeInputHash', () => {
  const baseInput = {
    birthDate: '1990-06-15',
    birthTime: '14:30' as string | null,
    lat: 48.8566,
    lng: 2.3522,
    timezone: 'Europe/Paris',
    houseSystem: 'placidus',
  };

  it('produces same hash for same inputs (deterministic)', () => {
    const hash1 = computeInputHash(baseInput);
    const hash2 = computeInputHash(baseInput);
    expect(hash1).toBe(hash2);
  });

  it('produces different hash for different inputs', () => {
    const hash1 = computeInputHash(baseInput);
    const hash2 = computeInputHash({ ...baseInput, birthDate: '1990-06-16' });
    expect(hash1).not.toBe(hash2);
  });

  it('handles null birthTime consistently', () => {
    const input1 = { ...baseInput, birthTime: null };
    const input2 = { ...baseInput, birthTime: null };
    expect(computeInputHash(input1)).toBe(computeInputHash(input2));
  });

  it('produces valid SHA-256 hex string (64 chars, hex only)', () => {
    const hash = computeInputHash(baseInput);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
