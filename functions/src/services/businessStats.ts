/**
 * Pure aggregation for the admin Business tab (REQ-006, DEC-006, DEC-012).
 * Everything here is deterministic: the callable does the Firestore reads and
 * hands plain rows in, so the counting rules can be unit-tested.
 *
 * Counting rules:
 *  - revenue is per currency, no conversion, summed from purchases.amountTotal;
 *  - only live-mode purchases count (see isLivePurchase);
 *  - all day/week/month buckets and period windows are in UTC, weeks start Monday;
 *  - a paying user is purchase.ownerUid, else profile.ownerUid, else
 *    purchase.ownerDeviceId, else profile.ownerDeviceId;
 *  - subscription charges are not part of revenue.
 */

export type Period = "7d" | "30d" | "90d" | "all";
export type Grouping = "day" | "week" | "month";

export const PERIODS: readonly Period[] = ["7d", "30d", "90d", "all"];
export const GROUPINGS: readonly Grouping[] = ["day", "week", "month"];

export interface PurchaseRow {
  /** Document id = Stripe checkout session id. */
  id: string;
  amountTotal: number | null;
  currency: string | null;
  createdAt: Date | null;
  livemode?: boolean | null;
  ownerUid?: string | null;
  ownerDeviceId?: string | null;
  profileId?: string | null;
}

export interface ProfileOwner {
  ownerUid?: string | null;
  ownerDeviceId?: string | null;
}

export interface SpendRow {
  feature: string;
  stars: number;
  createdAt: Date | null;
}

export interface CurrencyStats {
  currency: string;
  revenueCents: number;
  purchases: number;
  payingUsers: number;
  /** revenueCents / payingUsers, rounded to whole cents (0 without payers). */
  arppuCents: number;
  series: Array<{ bucket: string; revenueCents: number; purchases: number }>;
}

export interface BusinessStats {
  period: Period;
  grouping: Grouping;
  generatedAt: string;
  /** Inclusive UTC start of the window, null for "all". */
  since: string | null;
  currencies: CurrencyStats[];
  totals: { purchases: number; payingUsers: number };
  testPurchasesExcluded: number;
  subscriptions: { active: number; past_due: number; canceled: number; paused: number };
  newProfiles: number;
  starsByFeature: Array<{ feature: string; stars: number }>;
  /** Earliest starSpends row ever, so the UI can say when ledger data starts. */
  starLedgerSince: string | null;
}

const DAY_MS = 86_400_000;

/** Start of the UTC day containing `d`. */
export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Inclusive UTC window start: whole UTC days, today included. null = no lower bound. */
export function periodStart(period: Period, now: Date): Date | null {
  if (period === "all") return null;
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  return new Date(startOfUtcDay(now).getTime() - (days - 1) * DAY_MS);
}

/** Bucket label in UTC: day "2026-10-12", week = its Monday, month "2026-10". */
export function bucketKey(d: Date, grouping: Grouping): string {
  if (grouping === "month") return d.toISOString().slice(0, 7);
  if (grouping === "day") return d.toISOString().slice(0, 10);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - sinceMonday));
  return monday.toISOString().slice(0, 10);
}

/** Every bucket label from `from` to `to` inclusive, in order. */
export function bucketRange(from: Date, to: Date, grouping: Grouping): string[] {
  const keys: string[] = [];
  let cursor = grouping === "month"
    ? new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1))
    : startOfUtcDay(from);
  const last = bucketKey(to, grouping);
  for (let guard = 0; guard < 5000; guard++) {
    const key = bucketKey(cursor, grouping);
    if (keys[keys.length - 1] !== key) keys.push(key);
    if (key >= last) break;
    cursor = grouping === "month"
      ? new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
      : new Date(cursor.getTime() + (grouping === "week" ? 7 : 1) * DAY_MS);
  }
  return keys;
}

/**
 * Live-mode check (DEC-012). New purchases carry `livemode`; legacy ones do not,
 * but their document id is the Stripe session id, whose prefix encodes the mode.
 */
export function isLivePurchase(p: Pick<PurchaseRow, "id" | "livemode">): boolean {
  if (typeof p.livemode === "boolean") return p.livemode;
  return p.id.startsWith("cs_live_");
}

/** Paying-user key: ownerUid, then the profile's ownerUid, then the device ids. */
export function payerKey(p: PurchaseRow, profile: ProfileOwner | undefined): string | null {
  const uid = p.ownerUid || profile?.ownerUid;
  if (uid) return `uid:${uid}`;
  const device = p.ownerDeviceId || profile?.ownerDeviceId;
  if (device) return `device:${device}`;
  return null;
}

const sortCurrencies = (a: CurrencyStats, b: CurrencyStats) =>
  b.revenueCents - a.revenueCents || a.currency.localeCompare(b.currency);

export function computeBusinessStats(input: {
  period: Period;
  grouping: Grouping;
  now: Date;
  purchases: PurchaseRow[];
  /** Profile owners keyed by profile id (for legacy purchases without ownerUid). */
  profiles: Map<string, ProfileOwner>;
  subscriptionStatuses: string[];
  newProfiles: number;
  spends: SpendRow[];
  firstSpendAt: Date | null;
}): BusinessStats {
  const { period, grouping, now } = input;
  const since = periodStart(period, now);
  const inWindow = (d: Date | null) => d !== null && (since === null || d >= since) && d <= now;

  let testPurchasesExcluded = 0;
  const live: PurchaseRow[] = [];
  for (const p of input.purchases) {
    if (!inWindow(p.createdAt)) continue;
    if (!isLivePurchase(p)) {
      testPurchasesExcluded += 1;
      continue;
    }
    live.push(p);
  }

  const byCurrency = new Map<string, PurchaseRow[]>();
  for (const p of live) {
    const cur = (p.currency || "usd").toLowerCase();
    const list = byCurrency.get(cur) ?? [];
    list.push(p);
    byCurrency.set(cur, list);
  }

  const allPayers = new Set<string>();
  const currencies: CurrencyStats[] = [];
  for (const [cur, rows] of byCurrency) {
    const payers = new Set<string>();
    const buckets = new Map<string, { revenueCents: number; purchases: number }>();
    let revenueCents = 0;
    for (const p of rows) {
      const cents = Number(p.amountTotal) || 0;
      revenueCents += cents;
      const key = payerKey(p, p.profileId ? input.profiles.get(p.profileId) : undefined);
      if (key) {
        payers.add(key);
        allPayers.add(key);
      }
      const bk = bucketKey(p.createdAt as Date, grouping);
      const b = buckets.get(bk) ?? { revenueCents: 0, purchases: 0 };
      b.revenueCents += cents;
      b.purchases += 1;
      buckets.set(bk, b);
    }
    const first = rows.reduce((m, p) => ((p.createdAt as Date) < m ? (p.createdAt as Date) : m), rows[0].createdAt as Date);
    const rangeFrom = since ?? first;
    const series = bucketRange(rangeFrom, now, grouping).map((bucket) => ({
      bucket,
      revenueCents: buckets.get(bucket)?.revenueCents ?? 0,
      purchases: buckets.get(bucket)?.purchases ?? 0,
    }));
    currencies.push({
      currency: cur.toUpperCase(),
      revenueCents,
      purchases: rows.length,
      payingUsers: payers.size,
      arppuCents: payers.size > 0 ? Math.round(revenueCents / payers.size) : 0,
      series,
    });
  }
  currencies.sort(sortCurrencies);

  const subscriptions = { active: 0, past_due: 0, canceled: 0, paused: 0 };
  for (const s of input.subscriptionStatuses) {
    if (s in subscriptions) subscriptions[s as keyof typeof subscriptions] += 1;
  }

  const stars = new Map<string, number>();
  for (const s of input.spends) {
    if (!inWindow(s.createdAt)) continue;
    stars.set(s.feature, (stars.get(s.feature) ?? 0) + s.stars);
  }
  const starsByFeature = [...stars.entries()]
    .map(([feature, n]) => ({ feature, stars: n }))
    .sort((a, b) => b.stars - a.stars || a.feature.localeCompare(b.feature));

  return {
    period,
    grouping,
    generatedAt: now.toISOString(),
    since: since ? since.toISOString() : null,
    currencies,
    totals: { purchases: live.length, payingUsers: allPayers.size },
    testPurchasesExcluded,
    subscriptions,
    newProfiles: input.newProfiles,
    starsByFeature,
    starLedgerSince: input.firstSpendAt ? input.firstSpendAt.toISOString() : null,
  };
}
