"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const chart_1 = require("../astro/chart");
/**
 * Reference chart: Albert Einstein
 * Born March 14, 1879, 11:30 AM in Ulm, Germany
 * Well-documented natal chart in astrological literature.
 */
const einsteinInput = {
    birthDate: '1879-03-14',
    birthTime: '11:30',
    timeUnknown: false,
    lat: 48.4011,
    lng: 9.9876,
    timezone: 'Europe/Berlin',
    houseSystem: 'placidus',
};
/** Expected sign placements for Einstein's chart (well-established references) */
const expectedSigns = {
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
(0, vitest_1.describe)('computeNatalChart — Einstein reference chart', () => {
    const result = (0, chart_1.computeNatalChart)(einsteinInput);
    // ---- a) Correct structure ----
    (0, vitest_1.describe)('structure', () => {
        (0, vitest_1.it)('has meta, points, houses, aspects properties', () => {
            (0, vitest_1.expect)(result).toHaveProperty('meta');
            (0, vitest_1.expect)(result).toHaveProperty('points');
            (0, vitest_1.expect)(result).toHaveProperty('houses');
            (0, vitest_1.expect)(result).toHaveProperty('aspects');
        });
        (0, vitest_1.it)('meta.houseSystem is "placidus"', () => {
            (0, vitest_1.expect)(result.meta.houseSystem).toBe('placidus');
        });
        (0, vitest_1.it)('meta.zodiac is "tropical"', () => {
            (0, vitest_1.expect)(result.meta.zodiac).toBe('tropical');
        });
        (0, vitest_1.it)('meta.timeUsed is "11:30"', () => {
            (0, vitest_1.expect)(result.meta.timeUsed).toBe('11:30');
        });
        (0, vitest_1.it)('meta.timezoneUsed is "Europe/Berlin"', () => {
            (0, vitest_1.expect)(result.meta.timezoneUsed).toBe('Europe/Berlin');
        });
        (0, vitest_1.it)('points has exactly 10 entries', () => {
            (0, vitest_1.expect)(result.points).toHaveLength(10);
        });
        (0, vitest_1.it)('houses.cusps has exactly 12 entries', () => {
            (0, vitest_1.expect)(result.houses.cusps).toHaveLength(12);
        });
        (0, vitest_1.it)('houses.asc is a number (not null)', () => {
            (0, vitest_1.expect)(result.houses.asc).not.toBeNull();
            (0, vitest_1.expect)(typeof result.houses.asc).toBe('number');
        });
        (0, vitest_1.it)('houses.mc is a number (not null)', () => {
            (0, vitest_1.expect)(result.houses.mc).not.toBeNull();
            (0, vitest_1.expect)(typeof result.houses.mc).toBe('number');
        });
        (0, vitest_1.it)('aspects is a non-empty array', () => {
            (0, vitest_1.expect)(Array.isArray(result.aspects)).toBe(true);
            (0, vitest_1.expect)(result.aspects.length).toBeGreaterThan(0);
        });
    });
    // ---- b) Correct sign placements ----
    (0, vitest_1.describe)('sign placements', () => {
        for (const [body, expectedSign] of Object.entries(expectedSigns)) {
            (0, vitest_1.it)(`${body} is in ${expectedSign}`, () => {
                const point = result.points.find((p) => p.body === body);
                (0, vitest_1.expect)(point).toBeDefined();
                (0, vitest_1.expect)(point.sign).toBe(expectedSign);
            });
        }
    });
    // ---- c) Degree reasonableness ----
    (0, vitest_1.describe)('degree reasonableness', () => {
        (0, vitest_1.it)('all point longitudes are between 0 and 360', () => {
            for (const point of result.points) {
                (0, vitest_1.expect)(point.lon).toBeGreaterThanOrEqual(0);
                (0, vitest_1.expect)(point.lon).toBeLessThan(360);
            }
        });
        (0, vitest_1.it)('all degreeInSign values are between 0 and 30', () => {
            for (const point of result.points) {
                (0, vitest_1.expect)(point.degreeInSign).toBeGreaterThanOrEqual(0);
                (0, vitest_1.expect)(point.degreeInSign).toBeLessThan(30);
            }
        });
        (0, vitest_1.it)('all house numbers are between 1 and 12', () => {
            for (const point of result.points) {
                (0, vitest_1.expect)(point.house).toBeGreaterThanOrEqual(1);
                (0, vitest_1.expect)(point.house).toBeLessThanOrEqual(12);
            }
        });
    });
    // ---- d) House assignments ----
    (0, vitest_1.describe)('house assignments', () => {
        (0, vitest_1.it)('all 10 points have non-null house values', () => {
            for (const point of result.points) {
                (0, vitest_1.expect)(point.house).not.toBeNull();
            }
        });
        (0, vitest_1.it)('all house numbers are 1-12', () => {
            for (const point of result.points) {
                (0, vitest_1.expect)(point.house).toBeGreaterThanOrEqual(1);
                (0, vitest_1.expect)(point.house).toBeLessThanOrEqual(12);
            }
        });
        (0, vitest_1.it)('all house cusps are between 0 and 360', () => {
            for (const cusp of result.houses.cusps) {
                (0, vitest_1.expect)(cusp).toBeGreaterThanOrEqual(0);
                (0, vitest_1.expect)(cusp).toBeLessThan(360);
            }
        });
        (0, vitest_1.it)('ASC is between 0 and 360', () => {
            (0, vitest_1.expect)(result.houses.asc).toBeGreaterThanOrEqual(0);
            (0, vitest_1.expect)(result.houses.asc).toBeLessThan(360);
        });
        (0, vitest_1.it)('MC is between 0 and 360', () => {
            (0, vitest_1.expect)(result.houses.mc).toBeGreaterThanOrEqual(0);
            (0, vitest_1.expect)(result.houses.mc).toBeLessThan(360);
        });
    });
    // ---- e) Aspects ----
    (0, vitest_1.describe)('aspects', () => {
        (0, vitest_1.it)('each aspect has valid fields', () => {
            for (const aspect of result.aspects) {
                (0, vitest_1.expect)(typeof aspect.a).toBe('string');
                (0, vitest_1.expect)(typeof aspect.b).toBe('string');
                (0, vitest_1.expect)(VALID_ASPECT_TYPES).toContain(aspect.type);
                (0, vitest_1.expect)(aspect.orb).toBeGreaterThanOrEqual(0);
                (0, vitest_1.expect)(aspect.exactness).toBeGreaterThanOrEqual(0);
                (0, vitest_1.expect)(aspect.exactness).toBeLessThanOrEqual(1);
            }
        });
        (0, vitest_1.it)('aspects are sorted by exactness descending', () => {
            for (let i = 1; i < result.aspects.length; i++) {
                (0, vitest_1.expect)(result.aspects[i - 1].exactness).toBeGreaterThanOrEqual(result.aspects[i].exactness);
            }
        });
        (0, vitest_1.it)('no duplicate pairs (a-b should not also appear as b-a)', () => {
            const seen = new Set();
            for (const aspect of result.aspects) {
                const key = [aspect.a, aspect.b].sort().join('|');
                (0, vitest_1.expect)(seen.has(key)).toBe(false);
                seen.add(key);
            }
        });
    });
    // ---- f) Reproducibility ----
    (0, vitest_1.describe)('reproducibility', () => {
        (0, vitest_1.it)('same input produces identical output', () => {
            const result1 = (0, chart_1.computeNatalChart)(einsteinInput);
            const result2 = (0, chart_1.computeNatalChart)(einsteinInput);
            (0, vitest_1.expect)(JSON.stringify(result1)).toBe(JSON.stringify(result2));
        });
    });
    // ---- g) timeUnknown mode ----
    (0, vitest_1.describe)('timeUnknown mode', () => {
        const timeUnknownResult = (0, chart_1.computeNatalChart)({
            ...einsteinInput,
            timeUnknown: true,
        });
        (0, vitest_1.it)('houses.asc is null', () => {
            (0, vitest_1.expect)(timeUnknownResult.houses.asc).toBeNull();
        });
        (0, vitest_1.it)('houses.mc is null', () => {
            (0, vitest_1.expect)(timeUnknownResult.houses.mc).toBeNull();
        });
        (0, vitest_1.it)('all points have house: null', () => {
            for (const point of timeUnknownResult.points) {
                (0, vitest_1.expect)(point.house).toBeNull();
            }
        });
        (0, vitest_1.it)('aspects do NOT include ASC or MC as participants', () => {
            for (const aspect of timeUnknownResult.aspects) {
                (0, vitest_1.expect)(aspect.a).not.toBe('ASC');
                (0, vitest_1.expect)(aspect.a).not.toBe('MC');
                (0, vitest_1.expect)(aspect.b).not.toBe('ASC');
                (0, vitest_1.expect)(aspect.b).not.toBe('MC');
            }
        });
    });
    // ---- h) Whole Sign house system ----
    (0, vitest_1.describe)('Whole Sign house system', () => {
        const wholeSignResult = (0, chart_1.computeNatalChart)({
            ...einsteinInput,
            houseSystem: 'whole-sign',
        });
        (0, vitest_1.it)('meta.houseSystem is "whole-sign"', () => {
            (0, vitest_1.expect)(wholeSignResult.meta.houseSystem).toBe('whole-sign');
        });
        (0, vitest_1.it)('house cusps are at 30-degree intervals', () => {
            const cusps = wholeSignResult.houses.cusps;
            for (let i = 0; i < 12; i++) {
                const nextIdx = (i + 1) % 12;
                let diff = cusps[nextIdx] - cusps[i];
                if (diff < 0)
                    diff += 360;
                (0, vitest_1.expect)(diff).toBeCloseTo(30, 0);
            }
        });
        (0, vitest_1.it)('all 10 points have valid house assignments', () => {
            for (const point of wholeSignResult.points) {
                (0, vitest_1.expect)(point.house).not.toBeNull();
                (0, vitest_1.expect)(point.house).toBeGreaterThanOrEqual(1);
                (0, vitest_1.expect)(point.house).toBeLessThanOrEqual(12);
            }
        });
    });
});
