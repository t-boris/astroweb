import { describe, it, expect, vi } from 'vitest';
import { summarizeSubscription, withSubscriptions, type SubscriptionDoc } from '../services/subscriptionSummary';
import type { Profile } from '../types';

/**
 * The subscription marks of the profile list (services/subscriptionSummary.ts): which record shows as what,
 * one batched read for the whole list, and a failed read never empties the list.
 */

const NOW = new Date('2026-11-21T12:00:00.000Z');
const FUTURE = '2026-12-05T00:00:00.000Z';
const PAST = '2026-11-01T00:00:00.000Z';

function profile(id: string): Profile {
  return {
    id,
    ownerDeviceId: 'device',
    name: `Profile ${id}`,
    birthDate: '1990-01-01',
    birthTime: null,
    timeUnknown: true,
    birthPlace: 'London',
    lat: 51.5,
    lng: -0.1,
    timezone: 'Europe/London',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('summarizeSubscription', () => {
  it('shows a running subscription as active with its cadence and period end', () => {
    expect(summarizeSubscription({ status: 'active', cadence: 'every_2_days', canceledAt: null, currentPeriodEnd: FUTURE }, NOW)).toEqual({
      state: 'active',
      cadence: 'every_2_days',
      until: FUTURE,
    });
  });

  it('keeps a subscription that was cancelled at period end visible as ending until the period is over', () => {
    const doc: SubscriptionDoc = { status: 'active', cadence: 'daily', canceledAt: '2026-11-20T00:00:00.000Z', currentPeriodEnd: FUTURE };
    expect(summarizeSubscription(doc, NOW)).toEqual({ state: 'ending', cadence: 'daily', until: FUTURE });
    expect(summarizeSubscription({ ...doc, currentPeriodEnd: PAST }, NOW)).toBeNull();
    expect(summarizeSubscription({ ...doc, currentPeriodEnd: null }, NOW)).toBeNull();
  });

  it('shows paused and past_due records', () => {
    expect(summarizeSubscription({ status: 'paused', cadence: 'weekly', currentPeriodEnd: FUTURE }, NOW)?.state).toBe('paused');
    expect(summarizeSubscription({ status: 'past_due', cadence: 'weekly', currentPeriodEnd: FUTURE }, NOW)?.state).toBe('past_due');
  });

  it('shows nothing for a cancelled, unknown or missing record', () => {
    expect(summarizeSubscription({ status: 'canceled', cadence: 'daily', currentPeriodEnd: FUTURE }, NOW)).toBeNull();
    expect(summarizeSubscription({ status: 'something-else' }, NOW)).toBeNull();
    expect(summarizeSubscription({}, NOW)).toBeNull();
    expect(summarizeSubscription(undefined, NOW)).toBeNull();
  });

  it('copes with a record that has no cadence or period end', () => {
    expect(summarizeSubscription({ status: 'active' }, NOW)).toEqual({ state: 'active', cadence: '', until: null });
  });
});

describe('withSubscriptions', () => {
  it('reads every profile in one batch and marks only those with a visible subscription', async () => {
    const load = vi.fn(async () =>
      new Map<string, SubscriptionDoc>([
        ['a', { status: 'active', cadence: 'daily', currentPeriodEnd: FUTURE }],
        ['b', { status: 'canceled', cadence: 'daily', currentPeriodEnd: FUTURE }],
      ]),
    );
    const result = await withSubscriptions([profile('a'), profile('b'), profile('c')], load, NOW);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(['a', 'b', 'c']);
    expect(result.map((p) => p.subscription?.state)).toEqual(['active', undefined, undefined]);
    // The other fields are untouched and the input objects are not changed.
    expect(result[0].name).toBe('Profile a');
  });

  it('does not mutate the profiles it was given', async () => {
    const input = [profile('a')];
    await withSubscriptions(input, async () => new Map([['a', { status: 'active', currentPeriodEnd: FUTURE }]]), NOW);
    expect(input[0].subscription).toBeUndefined();
  });

  it('does not read anything for an empty list', async () => {
    const load = vi.fn(async () => new Map<string, SubscriptionDoc>());
    expect(await withSubscriptions([], load, NOW)).toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });

  it('returns the profiles unchanged and reports the error when the read fails', async () => {
    const onError = vi.fn();
    const profiles = [profile('a'), profile('b')];
    const result = await withSubscriptions(profiles, async () => Promise.reject(new Error('unavailable')), NOW, onError);
    expect(result).toEqual(profiles);
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0][0] as Error).message).toBe('unavailable');
  });
});
