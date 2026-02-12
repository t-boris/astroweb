"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const aspects_1 = require("../astro/aspects");
const zodiac_1 = require("../astro/zodiac");
const houses_1 = require("../astro/houses");
const chart_1 = require("../services/chart");
// ============================================================
// angularDifference
// ============================================================
(0, vitest_1.describe)('angularDifference', () => {
    (0, vitest_1.it)('returns 180 for opposition (0, 180)', () => {
        (0, vitest_1.expect)((0, aspects_1.angularDifference)(0, 180)).toBe(180);
    });
    (0, vitest_1.it)('returns 20 for wrap-around (350, 10)', () => {
        (0, vitest_1.expect)((0, aspects_1.angularDifference)(350, 10)).toBe(20);
    });
    (0, vitest_1.it)('returns 20 for reverse wrap-around (10, 350)', () => {
        (0, vitest_1.expect)((0, aspects_1.angularDifference)(10, 350)).toBe(20);
    });
    (0, vitest_1.it)('returns 0 for same point (0, 0)', () => {
        (0, vitest_1.expect)((0, aspects_1.angularDifference)(0, 0)).toBe(0);
    });
    (0, vitest_1.it)('returns 180 for opposition via wrap (90, 270)', () => {
        (0, vitest_1.expect)((0, aspects_1.angularDifference)(90, 270)).toBe(180);
    });
    (0, vitest_1.it)('returns 0 for identical points (180, 180)', () => {
        (0, vitest_1.expect)((0, aspects_1.angularDifference)(180, 180)).toBe(0);
    });
});
// ============================================================
// detectAspect
// ============================================================
(0, vitest_1.describe)('detectAspect', () => {
    (0, vitest_1.it)('detects exact conjunction', () => {
        const result = (0, aspects_1.detectAspect)('Sun', 100, 'Moon', 100);
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.type).toBe('conjunction');
        (0, vitest_1.expect)(result.orb).toBe(0);
        (0, vitest_1.expect)(result.exactness).toBe(1);
    });
    (0, vitest_1.it)('detects exact trine', () => {
        const result = (0, aspects_1.detectAspect)('Sun', 0, 'Moon', 120);
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.type).toBe('trine');
        (0, vitest_1.expect)(result.orb).toBe(0);
        (0, vitest_1.expect)(result.exactness).toBe(1);
    });
    (0, vitest_1.it)('detects trine with orb', () => {
        const result = (0, aspects_1.detectAspect)('Sun', 0, 'Moon', 124);
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.type).toBe('trine');
        (0, vitest_1.expect)(result.orb).toBe(4);
        (0, vitest_1.expect)(result.exactness).toBeCloseTo(0.33, 1);
    });
    (0, vitest_1.it)('returns null for non-major aspect (45 degrees)', () => {
        const result = (0, aspects_1.detectAspect)('Sun', 0, 'Moon', 45);
        (0, vitest_1.expect)(result).toBeNull();
    });
    (0, vitest_1.it)('detects aspect at orb boundary (exactly 6 degrees)', () => {
        const result = (0, aspects_1.detectAspect)('Sun', 0, 'Moon', 126);
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.type).toBe('trine');
        (0, vitest_1.expect)(result.exactness).toBe(0);
    });
    (0, vitest_1.it)('returns null beyond orb (7 degrees from trine)', () => {
        const result = (0, aspects_1.detectAspect)('Sun', 0, 'Moon', 127);
        (0, vitest_1.expect)(result).toBeNull();
    });
    (0, vitest_1.it)('detects opposition with wrap-around', () => {
        const result = (0, aspects_1.detectAspect)('Sun', 5, 'Moon', 185);
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.type).toBe('opposition');
    });
});
// ============================================================
// detectAllAspects
// ============================================================
(0, vitest_1.describe)('detectAllAspects', () => {
    (0, vitest_1.it)('detects aspects among 3 points and sorts by exactness', () => {
        const points = [
            { name: 'Sun', lon: 0 },
            { name: 'Moon', lon: 120 }, // trine to Sun (exact)
            { name: 'Mars', lon: 182 }, // opposition to Sun (2 deg orb)
        ];
        const aspects = (0, aspects_1.detectAllAspects)(points);
        (0, vitest_1.expect)(aspects.length).toBeGreaterThanOrEqual(1);
        // Most exact aspect should be first
        for (let i = 1; i < aspects.length; i++) {
            (0, vitest_1.expect)(aspects[i - 1].exactness).toBeGreaterThanOrEqual(aspects[i].exactness);
        }
    });
    (0, vitest_1.it)('returns empty array for empty input', () => {
        (0, vitest_1.expect)((0, aspects_1.detectAllAspects)([])).toEqual([]);
    });
    (0, vitest_1.it)('returns empty array for single point', () => {
        (0, vitest_1.expect)((0, aspects_1.detectAllAspects)([{ name: 'Sun', lon: 0 }])).toEqual([]);
    });
});
// ============================================================
// longitudeToZodiac
// ============================================================
(0, vitest_1.describe)('longitudeToZodiac', () => {
    (0, vitest_1.it)('converts 0 degrees to Aries 0', () => {
        const result = (0, zodiac_1.longitudeToZodiac)(0);
        (0, vitest_1.expect)(result.sign).toBe('Aries');
        (0, vitest_1.expect)(result.degreeInSign).toBe(0);
    });
    (0, vitest_1.it)('converts 30 degrees to Taurus 0', () => {
        const result = (0, zodiac_1.longitudeToZodiac)(30);
        (0, vitest_1.expect)(result.sign).toBe('Taurus');
        (0, vitest_1.expect)(result.degreeInSign).toBe(0);
    });
    (0, vitest_1.it)('converts 29.99 degrees to Aries ~29.99', () => {
        const result = (0, zodiac_1.longitudeToZodiac)(29.99);
        (0, vitest_1.expect)(result.sign).toBe('Aries');
        (0, vitest_1.expect)(result.degreeInSign).toBeCloseTo(29.99, 1);
    });
    (0, vitest_1.it)('converts 90 degrees to Cancer 0', () => {
        const result = (0, zodiac_1.longitudeToZodiac)(90);
        (0, vitest_1.expect)(result.sign).toBe('Cancer');
        (0, vitest_1.expect)(result.degreeInSign).toBe(0);
    });
    (0, vitest_1.it)('converts 359.99 degrees to Pisces ~29.99', () => {
        const result = (0, zodiac_1.longitudeToZodiac)(359.99);
        (0, vitest_1.expect)(result.sign).toBe('Pisces');
        (0, vitest_1.expect)(result.degreeInSign).toBeCloseTo(29.99, 1);
    });
    (0, vitest_1.it)('normalizes negative longitude (-10 -> Pisces 20)', () => {
        const result = (0, zodiac_1.longitudeToZodiac)(-10);
        (0, vitest_1.expect)(result.sign).toBe('Pisces');
        (0, vitest_1.expect)(result.degreeInSign).toBeCloseTo(20, 0);
    });
    (0, vitest_1.it)('normalizes longitude over 360 (370 -> Aries 10)', () => {
        const result = (0, zodiac_1.longitudeToZodiac)(370);
        (0, vitest_1.expect)(result.sign).toBe('Aries');
        (0, vitest_1.expect)(result.degreeInSign).toBeCloseTo(10, 0);
    });
});
// ============================================================
// findHouseForLongitude
// ============================================================
(0, vitest_1.describe)('findHouseForLongitude', () => {
    // Standard cusps evenly spaced at 30-degree intervals starting at 0
    const evenCusps = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
    (0, vitest_1.it)('places planet at 15 degrees in house 1 (even cusps)', () => {
        (0, vitest_1.expect)((0, houses_1.findHouseForLongitude)(15, evenCusps)).toBe(1);
    });
    (0, vitest_1.it)('handles wrap-around: planet at 355 degrees in house 12', () => {
        // cusps[11]=330, cusps[0]=0, so 355 is between 330 and 0 (wrap)
        (0, vitest_1.expect)((0, houses_1.findHouseForLongitude)(355, evenCusps)).toBe(12);
    });
    (0, vitest_1.it)('planet exactly on a cusp belongs to that house', () => {
        // Planet at 30 degrees should be in house 2 (cusps[1]=30, cusps[2]=60)
        (0, vitest_1.expect)((0, houses_1.findHouseForLongitude)(30, evenCusps)).toBe(2);
    });
    (0, vitest_1.it)('handles wrap-around cusps correctly', () => {
        // Cusps where house 12 crosses 0 degrees
        const wrappedCusps = [350, 20, 50, 80, 110, 140, 170, 200, 230, 260, 290, 320];
        // Planet at 355 is between cusp[0]=350 and cusp[1]=20, so house 1
        (0, vitest_1.expect)((0, houses_1.findHouseForLongitude)(355, wrappedCusps)).toBe(1);
        // Planet at 5 is between cusp[0]=350 and cusp[1]=20, so house 1
        (0, vitest_1.expect)((0, houses_1.findHouseForLongitude)(5, wrappedCusps)).toBe(1);
    });
});
// ============================================================
// computeInputHash
// ============================================================
(0, vitest_1.describe)('computeInputHash', () => {
    const baseInput = {
        birthDate: '1990-06-15',
        birthTime: '14:30',
        lat: 48.8566,
        lng: 2.3522,
        timezone: 'Europe/Paris',
        houseSystem: 'placidus',
    };
    (0, vitest_1.it)('produces same hash for same inputs (deterministic)', () => {
        const hash1 = (0, chart_1.computeInputHash)(baseInput);
        const hash2 = (0, chart_1.computeInputHash)(baseInput);
        (0, vitest_1.expect)(hash1).toBe(hash2);
    });
    (0, vitest_1.it)('produces different hash for different inputs', () => {
        const hash1 = (0, chart_1.computeInputHash)(baseInput);
        const hash2 = (0, chart_1.computeInputHash)({ ...baseInput, birthDate: '1990-06-16' });
        (0, vitest_1.expect)(hash1).not.toBe(hash2);
    });
    (0, vitest_1.it)('handles null birthTime consistently', () => {
        const input1 = { ...baseInput, birthTime: null };
        const input2 = { ...baseInput, birthTime: null };
        (0, vitest_1.expect)((0, chart_1.computeInputHash)(input1)).toBe((0, chart_1.computeInputHash)(input2));
    });
    (0, vitest_1.it)('produces valid SHA-256 hex string (64 chars, hex only)', () => {
        const hash = (0, chart_1.computeInputHash)(baseInput);
        (0, vitest_1.expect)(hash).toHaveLength(64);
        (0, vitest_1.expect)(hash).toMatch(/^[0-9a-f]{64}$/);
    });
});
