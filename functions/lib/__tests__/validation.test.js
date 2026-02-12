"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const profile_1 = require("../validation/profile");
// ============================================================
// isNonEmptyString
// ============================================================
(0, vitest_1.describe)('isNonEmptyString', () => {
    (0, vitest_1.it)('returns false for empty string', () => {
        (0, vitest_1.expect)((0, profile_1.isNonEmptyString)('')).toBe(false);
    });
    (0, vitest_1.it)('returns true for "hello"', () => {
        (0, vitest_1.expect)((0, profile_1.isNonEmptyString)('hello')).toBe(true);
    });
    (0, vitest_1.it)('returns false for whitespace-only string', () => {
        (0, vitest_1.expect)((0, profile_1.isNonEmptyString)('  ')).toBe(false);
    });
    (0, vitest_1.it)('returns false for null', () => {
        (0, vitest_1.expect)((0, profile_1.isNonEmptyString)(null)).toBe(false);
    });
    (0, vitest_1.it)('returns false for undefined', () => {
        (0, vitest_1.expect)((0, profile_1.isNonEmptyString)(undefined)).toBe(false);
    });
    (0, vitest_1.it)('returns false for number', () => {
        (0, vitest_1.expect)((0, profile_1.isNonEmptyString)(123)).toBe(false);
    });
});
// ============================================================
// isValidDate
// ============================================================
(0, vitest_1.describe)('isValidDate', () => {
    (0, vitest_1.it)('accepts valid date "2025-01-15"', () => {
        (0, vitest_1.expect)((0, profile_1.isValidDate)('2025-01-15')).toBe(true);
    });
    (0, vitest_1.it)('rejects Feb 29 in non-leap year', () => {
        (0, vitest_1.expect)((0, profile_1.isValidDate)('2025-02-29')).toBe(false);
    });
    (0, vitest_1.it)('accepts Feb 29 in leap year', () => {
        (0, vitest_1.expect)((0, profile_1.isValidDate)('2024-02-29')).toBe(true);
    });
    (0, vitest_1.it)('rejects month 13', () => {
        (0, vitest_1.expect)((0, profile_1.isValidDate)('2025-13-01')).toBe(false);
    });
    (0, vitest_1.it)('rejects day 32', () => {
        (0, vitest_1.expect)((0, profile_1.isValidDate)('2025-01-32')).toBe(false);
    });
    (0, vitest_1.it)('rejects non-date string', () => {
        (0, vitest_1.expect)((0, profile_1.isValidDate)('not-a-date')).toBe(false);
    });
    (0, vitest_1.it)('rejects wrong format "2025-1-1"', () => {
        (0, vitest_1.expect)((0, profile_1.isValidDate)('2025-1-1')).toBe(false);
    });
});
// ============================================================
// validateCreateProfilePayload
// ============================================================
(0, vitest_1.describe)('validateCreateProfilePayload', () => {
    const validPayload = {
        ownerDeviceId: 'device-abc-123',
        name: 'Albert Einstein',
        birthDate: '1879-03-14',
        birthTime: '11:30',
        timeUnknown: false,
        birthPlace: 'Ulm, Germany',
        lat: 48.4011,
        lng: 9.9876,
    };
    (0, vitest_1.it)('returns empty errors for valid complete payload', () => {
        const errors = (0, profile_1.validateCreateProfilePayload)(validPayload);
        (0, vitest_1.expect)(errors).toEqual([]);
    });
    (0, vitest_1.it)('returns error for missing ownerDeviceId', () => {
        const { ownerDeviceId, ...rest } = validPayload;
        const errors = (0, profile_1.validateCreateProfilePayload)(rest);
        (0, vitest_1.expect)(errors.some((e) => e.field === 'ownerDeviceId')).toBe(true);
    });
    (0, vitest_1.it)('returns error for missing name', () => {
        const { name, ...rest } = validPayload;
        const errors = (0, profile_1.validateCreateProfilePayload)(rest);
        (0, vitest_1.expect)(errors.some((e) => e.field === 'name')).toBe(true);
    });
    (0, vitest_1.it)('returns error for name > 100 chars', () => {
        const errors = (0, profile_1.validateCreateProfilePayload)({
            ...validPayload,
            name: 'x'.repeat(101),
        });
        (0, vitest_1.expect)(errors.some((e) => e.field === 'name')).toBe(true);
    });
    (0, vitest_1.it)('returns error for invalid birthDate format', () => {
        const errors = (0, profile_1.validateCreateProfilePayload)({
            ...validPayload,
            birthDate: '14-03-1879',
        });
        (0, vitest_1.expect)(errors.some((e) => e.field === 'birthDate')).toBe(true);
    });
    (0, vitest_1.it)('returns error for invalid birthTime format', () => {
        const errors = (0, profile_1.validateCreateProfilePayload)({
            ...validPayload,
            birthTime: '25:00',
        });
        (0, vitest_1.expect)(errors.some((e) => e.field === 'birthTime')).toBe(true);
    });
    (0, vitest_1.it)('returns error for non-boolean timeUnknown', () => {
        const errors = (0, profile_1.validateCreateProfilePayload)({
            ...validPayload,
            timeUnknown: 'yes',
        });
        (0, vitest_1.expect)(errors.some((e) => e.field === 'timeUnknown')).toBe(true);
    });
    (0, vitest_1.it)('returns error for lat out of range (-91)', () => {
        const errors = (0, profile_1.validateCreateProfilePayload)({
            ...validPayload,
            lat: -91,
        });
        (0, vitest_1.expect)(errors.some((e) => e.field === 'lat')).toBe(true);
    });
    (0, vitest_1.it)('returns error for lng out of range (181)', () => {
        const errors = (0, profile_1.validateCreateProfilePayload)({
            ...validPayload,
            lng: 181,
        });
        (0, vitest_1.expect)(errors.some((e) => e.field === 'lng')).toBe(true);
    });
    (0, vitest_1.it)('returns error for null payload', () => {
        const errors = (0, profile_1.validateCreateProfilePayload)(null);
        (0, vitest_1.expect)(errors.length).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('allows null birthTime without error', () => {
        const errors = (0, profile_1.validateCreateProfilePayload)({
            ...validPayload,
            birthTime: null,
        });
        (0, vitest_1.expect)(errors.some((e) => e.field === 'birthTime')).toBe(false);
    });
});
// ============================================================
// validateUpdateProfilePayload
// ============================================================
(0, vitest_1.describe)('validateUpdateProfilePayload', () => {
    (0, vitest_1.it)('returns empty errors for valid partial update', () => {
        const errors = (0, profile_1.validateUpdateProfilePayload)({
            ownerDeviceId: 'device-abc-123',
            name: 'New Name',
        });
        (0, vitest_1.expect)(errors).toEqual([]);
    });
    (0, vitest_1.it)('returns error for missing ownerDeviceId', () => {
        const errors = (0, profile_1.validateUpdateProfilePayload)({ name: 'New Name' });
        (0, vitest_1.expect)(errors.some((e) => e.field === 'ownerDeviceId')).toBe(true);
    });
    (0, vitest_1.it)('returns error when no updatable fields provided', () => {
        const errors = (0, profile_1.validateUpdateProfilePayload)({
            ownerDeviceId: 'device-abc-123',
        });
        (0, vitest_1.expect)(errors.length).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('validates field values same as create', () => {
        const errors = (0, profile_1.validateUpdateProfilePayload)({
            ownerDeviceId: 'device-abc-123',
            lat: -91,
        });
        (0, vitest_1.expect)(errors.some((e) => e.field === 'lat')).toBe(true);
    });
});
