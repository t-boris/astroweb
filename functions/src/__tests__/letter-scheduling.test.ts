import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeFirestore, type FakeFirestore } from './helpers/fakeFirestore';

const holder = vi.hoisted(() => ({ fake: null as unknown as FakeFirestore }));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => holder.fake.db,
}));

import { enqueueDueLetters } from '../services/letterScheduling';
import { cancellationTookEffect } from '../services/subscriptionLifecycle';

/** A cancelled subscription must stop getting letters once its paid period is over, whatever the payment provider told us. */

const NOW = new Date('2026-11-21T21:00:00.000Z');
const DUE = '2026-11-21T20:00:00.000Z';
const FUTURE = '2026-12-05T00:00:00.000Z';
const PAST = '2026-07-03T00:00:00.000Z';
const CANCELLED = '2026-06-20T00:00:00.000Z';

function seed(id: string, extra: Record<string, unknown> = {}) {
  holder.fake.seed('subscriptions', id, {
    ownerUid: `u-${id}`,
    status: 'active',
    cadence: 'daily',
    nextLetterAt: DUE,
    canceledAt: null,
    currentPeriodEnd: FUTURE,
    ...extra,
  });
}
type Snap = { docs: { id: string; ref: { update: (value: unknown) => Promise<void> } }[] };
type Chain = { where: (...args: unknown[]) => Chain; limit: (n: number) => Chain; get: () => Promise<Snap> };

/** Makes closing the given subscription fail, as a Firestore outage or a permission error would. */
function makeUpdatesFail(profileId: string) {
  const db = holder.fake.db as { collection: (name: string) => unknown };
  const collection = db.collection.bind(db);
  const wrap = (chain: Chain): Chain => ({
    where: (...args) => wrap(chain.where(...args)),
    limit: (n) => wrap(chain.limit(n)),
    get: async () => {
      const snap = await chain.get();
      for (const doc of snap.docs) {
        if (doc.id === profileId) doc.ref.update = async () => { throw new Error('boom'); };
      }
      return snap;
    },
  });
  db.collection = (name: string) => {
    const base = collection(name) as unknown as Chain & Record<string, unknown>;
    return name === 'subscriptions' ? { ...base, where: (...args: unknown[]) => wrap(base.where(...args)) } : base;
  };
}
/** Makes the query over cancelled subscriptions (the one filtering on canceledAt) fail, as a missing index does. */
function makeSweepFail() {
  const db = holder.fake.db as { collection: (name: string) => unknown };
  const collection = db.collection.bind(db);
  const wrap = (chain: Chain, sweeping: boolean): Chain => ({
    where: (...args) => wrap(chain.where(...args), sweeping || args[0] === 'canceledAt'),
    limit: (n) => wrap(chain.limit(n), sweeping),
    get: async () => {
      if (sweeping) throw new Error('FAILED_PRECONDITION: the query requires an index');
      return chain.get();
    },
  });
  db.collection = (name: string) => {
    const base = collection(name) as unknown as Chain & Record<string, unknown>;
    return name === 'subscriptions' ? { ...base, where: (...args: unknown[]) => wrap(base.where(...args), args[0] === 'canceledAt') } : base;
  };
}
const jobs = () => [...holder.fake.all('letterJobs').values()];
const sub = (id: string) => holder.fake.all('subscriptions').get(id) as Record<string, unknown>;

describe('cancellationTookEffect', () => {
  it('is false for a subscription that was never cancelled, whatever its period end says', () => {
    expect(cancellationTookEffect({ canceledAt: null, currentPeriodEnd: PAST }, NOW)).toBe(false);
    expect(cancellationTookEffect({}, NOW)).toBe(false);
  });

  it('is false while the paid period of a cancelled subscription is still ahead', () => {
    expect(cancellationTookEffect({ canceledAt: CANCELLED, currentPeriodEnd: FUTURE }, NOW)).toBe(false);
  });

  it('is true once the period is over, and when the period end is past, missing, unreadable or the epoch', () => {
    expect(cancellationTookEffect({ canceledAt: CANCELLED, currentPeriodEnd: PAST }, NOW)).toBe(true);
    expect(cancellationTookEffect({ canceledAt: CANCELLED, currentPeriodEnd: NOW.toISOString() }, NOW)).toBe(true);
    expect(cancellationTookEffect({ canceledAt: CANCELLED, currentPeriodEnd: null }, NOW)).toBe(true);
    expect(cancellationTookEffect({ canceledAt: CANCELLED }, NOW)).toBe(true);
    expect(cancellationTookEffect({ canceledAt: CANCELLED, currentPeriodEnd: 'not a date' }, NOW)).toBe(true);
    expect(cancellationTookEffect({ canceledAt: CANCELLED, currentPeriodEnd: '1970-01-01T00:00:00.000Z' }, NOW)).toBe(true);
  });
});

describe('enqueueDueLetters', () => {
  beforeEach(() => {
    holder.fake = createFakeFirestore();
  });

  it('queues a letter for a running subscription whose letter is due', async () => {
    seed('a');
    const result = await enqueueDueLetters(NOW);
    expect(result).toEqual({ due: 1, enqueued: 1, closed: 0 });
    expect(jobs()).toEqual([
      expect.objectContaining({ profileId: 'a', ownerUid: 'u-a', cadence: 'daily', windowStart: DUE, status: 'queued' }),
    ]);
    expect(sub('a').status).toBe('active');
  });

  it('sends no letter for a cancelled subscription whose period is over and closes it', async () => {
    seed('gone', { canceledAt: CANCELLED, currentPeriodEnd: PAST });
    const result = await enqueueDueLetters(NOW);
    expect(result).toEqual({ due: 0, enqueued: 0, closed: 1 });
    expect(jobs()).toHaveLength(0);
    expect(sub('gone').status).toBe('canceled');
  });

  it('closes a cancelled subscription that has no usable period end', async () => {
    seed('no-end', { canceledAt: CANCELLED, currentPeriodEnd: null });
    await enqueueDueLetters(NOW);
    expect(jobs()).toHaveLength(0);
    expect(sub('no-end').status).toBe('canceled');
  });

  it('keeps sending until the paid period of a cancelled subscription is over', async () => {
    seed('paid', { canceledAt: CANCELLED, currentPeriodEnd: FUTURE });
    const result = await enqueueDueLetters(NOW);
    expect(result).toEqual({ due: 1, enqueued: 1, closed: 0 });
    expect(sub('paid').status).toBe('active');
  });

  it('handles several subscriptions in one tick independently', async () => {
    seed('a');
    seed('gone', { canceledAt: CANCELLED, currentPeriodEnd: PAST });
    seed('paid', { canceledAt: CANCELLED, currentPeriodEnd: FUTURE });
    const result = await enqueueDueLetters(NOW);
    expect(result).toEqual({ due: 2, enqueued: 2, closed: 1 });
    expect(jobs().map((j) => j.profileId).sort()).toEqual(['a', 'paid']);
  });

  it('leaves alone a subscription that is paused, already cancelled or not due yet', async () => {
    seed('paused', { status: 'paused' });
    seed('done', { status: 'canceled', canceledAt: CANCELLED, currentPeriodEnd: PAST });
    seed('later', { nextLetterAt: '2026-11-22T08:00:00.000Z' });
    const result = await enqueueDueLetters(NOW);
    expect(result).toEqual({ due: 0, enqueued: 0, closed: 0 });
    expect(jobs()).toHaveLength(0);
    expect(sub('done').status).toBe('canceled');
  });

  it('does not queue the same letter twice on the next tick', async () => {
    seed('a');
    await enqueueDueLetters(NOW);
    const second = await enqueueDueLetters(new Date(NOW.getTime() + 15 * 60_000));
    expect(second.enqueued).toBe(0);
    expect(jobs()).toHaveLength(1);
  });

  it('closes a cancelled subscription whose letter is not due yet, so no screen keeps showing it as active', async () => {
    seed('gone', { canceledAt: CANCELLED, currentPeriodEnd: PAST, nextLetterAt: '2026-11-23T08:00:00.000Z' });
    const result = await enqueueDueLetters(NOW);
    expect(result).toEqual({ due: 0, enqueued: 0, closed: 1 });
    expect(sub('gone').status).toBe('canceled');
    expect(sub('gone').updatedAt).toBe(NOW.toISOString());
  });

  it('leaves a cancelled subscription alone while its paid period is still ahead', async () => {
    seed('paid', { canceledAt: CANCELLED, currentPeriodEnd: FUTURE, nextLetterAt: '2026-11-23T08:00:00.000Z' });
    const result = await enqueueDueLetters(NOW);
    expect(result.closed).toBe(0);
    expect(sub('paid').status).toBe('active');
  });

  it('does not touch a subscription that was never cancelled', async () => {
    seed('running', { nextLetterAt: '2026-11-23T08:00:00.000Z', currentPeriodEnd: PAST });
    await enqueueDueLetters(NOW);
    expect(sub('running').status).toBe('active');
  });

  it('closes every cancelled subscription of an account, not only the first', async () => {
    seed('one', { canceledAt: CANCELLED, currentPeriodEnd: PAST, nextLetterAt: '2026-11-22T21:00:00.000Z' });
    seed('two', { canceledAt: CANCELLED, currentPeriodEnd: null, nextLetterAt: '2026-11-23T08:00:00.000Z' });
    const result = await enqueueDueLetters(NOW);
    expect(result.closed).toBe(2);
    expect([sub('one').status, sub('two').status]).toEqual(['canceled', 'canceled']);
  });

  it('still queues the others when closing one subscription fails, and sends nothing to the one it could not close', async () => {
    seed('a');
    seed('gone', { canceledAt: CANCELLED, currentPeriodEnd: PAST });
    makeUpdatesFail('gone');
    const result = await enqueueDueLetters(NOW);
    expect(result).toEqual({ due: 2, enqueued: 1, closed: 0 });
    expect(jobs().map((j) => j.profileId)).toEqual(['a']);
  });

  it('still queues the letters when the pass over cancelled subscriptions cannot run (for example its index is building)', async () => {
    seed('a');
    seed('gone', { canceledAt: CANCELLED, currentPeriodEnd: PAST });
    makeSweepFail();
    const result = await enqueueDueLetters(NOW);
    // The due pass applies the same rule, so the cancelled one still gets no letter and is closed there.
    expect(result).toEqual({ due: 2, enqueued: 1, closed: 1 });
    expect(jobs().map((j) => j.profileId)).toEqual(['a']);
    expect(sub('gone').status).toBe('canceled');
  });
});
