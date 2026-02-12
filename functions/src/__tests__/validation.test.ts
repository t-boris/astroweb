import { describe, it, expect } from 'vitest';
import {
  isNonEmptyString,
  isValidDate,
  validateCreateProfilePayload,
  validateUpdateProfilePayload,
} from '../validation/profile';

// ============================================================
// isNonEmptyString
// ============================================================
describe('isNonEmptyString', () => {
  it('returns false for empty string', () => {
    expect(isNonEmptyString('')).toBe(false);
  });

  it('returns true for "hello"', () => {
    expect(isNonEmptyString('hello')).toBe(true);
  });

  it('returns false for whitespace-only string', () => {
    expect(isNonEmptyString('  ')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isNonEmptyString(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isNonEmptyString(undefined)).toBe(false);
  });

  it('returns false for number', () => {
    expect(isNonEmptyString(123)).toBe(false);
  });
});

// ============================================================
// isValidDate
// ============================================================
describe('isValidDate', () => {
  it('accepts valid date "2025-01-15"', () => {
    expect(isValidDate('2025-01-15')).toBe(true);
  });

  it('rejects Feb 29 in non-leap year', () => {
    expect(isValidDate('2025-02-29')).toBe(false);
  });

  it('accepts Feb 29 in leap year', () => {
    expect(isValidDate('2024-02-29')).toBe(true);
  });

  it('rejects month 13', () => {
    expect(isValidDate('2025-13-01')).toBe(false);
  });

  it('rejects day 32', () => {
    expect(isValidDate('2025-01-32')).toBe(false);
  });

  it('rejects non-date string', () => {
    expect(isValidDate('not-a-date')).toBe(false);
  });

  it('rejects wrong format "2025-1-1"', () => {
    expect(isValidDate('2025-1-1')).toBe(false);
  });
});

// ============================================================
// validateCreateProfilePayload
// ============================================================
describe('validateCreateProfilePayload', () => {
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

  it('returns empty errors for valid complete payload', () => {
    const errors = validateCreateProfilePayload(validPayload);
    expect(errors).toEqual([]);
  });

  it('returns error for missing ownerDeviceId', () => {
    const { ownerDeviceId, ...rest } = validPayload;
    const errors = validateCreateProfilePayload(rest);
    expect(errors.some((e) => e.field === 'ownerDeviceId')).toBe(true);
  });

  it('returns error for missing name', () => {
    const { name, ...rest } = validPayload;
    const errors = validateCreateProfilePayload(rest);
    expect(errors.some((e) => e.field === 'name')).toBe(true);
  });

  it('returns error for name > 100 chars', () => {
    const errors = validateCreateProfilePayload({
      ...validPayload,
      name: 'x'.repeat(101),
    });
    expect(errors.some((e) => e.field === 'name')).toBe(true);
  });

  it('returns error for invalid birthDate format', () => {
    const errors = validateCreateProfilePayload({
      ...validPayload,
      birthDate: '14-03-1879',
    });
    expect(errors.some((e) => e.field === 'birthDate')).toBe(true);
  });

  it('returns error for invalid birthTime format', () => {
    const errors = validateCreateProfilePayload({
      ...validPayload,
      birthTime: '25:00',
    });
    expect(errors.some((e) => e.field === 'birthTime')).toBe(true);
  });

  it('returns error for non-boolean timeUnknown', () => {
    const errors = validateCreateProfilePayload({
      ...validPayload,
      timeUnknown: 'yes',
    });
    expect(errors.some((e) => e.field === 'timeUnknown')).toBe(true);
  });

  it('returns error for lat out of range (-91)', () => {
    const errors = validateCreateProfilePayload({
      ...validPayload,
      lat: -91,
    });
    expect(errors.some((e) => e.field === 'lat')).toBe(true);
  });

  it('returns error for lng out of range (181)', () => {
    const errors = validateCreateProfilePayload({
      ...validPayload,
      lng: 181,
    });
    expect(errors.some((e) => e.field === 'lng')).toBe(true);
  });

  it('returns error for null payload', () => {
    const errors = validateCreateProfilePayload(null);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('allows null birthTime without error', () => {
    const errors = validateCreateProfilePayload({
      ...validPayload,
      birthTime: null,
    });
    expect(errors.some((e) => e.field === 'birthTime')).toBe(false);
  });
});

// ============================================================
// validateUpdateProfilePayload
// ============================================================
describe('validateUpdateProfilePayload', () => {
  it('returns empty errors for valid partial update', () => {
    const errors = validateUpdateProfilePayload({
      ownerDeviceId: 'device-abc-123',
      name: 'New Name',
    });
    expect(errors).toEqual([]);
  });

  it('returns error for missing ownerDeviceId', () => {
    const errors = validateUpdateProfilePayload({ name: 'New Name' });
    expect(errors.some((e) => e.field === 'ownerDeviceId')).toBe(true);
  });

  it('returns error when no updatable fields provided', () => {
    const errors = validateUpdateProfilePayload({
      ownerDeviceId: 'device-abc-123',
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('validates field values same as create', () => {
    const errors = validateUpdateProfilePayload({
      ownerDeviceId: 'device-abc-123',
      lat: -91,
    });
    expect(errors.some((e) => e.field === 'lat')).toBe(true);
  });
});
