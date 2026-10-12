import { describe, expect, it } from "vitest";
import {
  bucketKey,
  bucketRange,
  computeBusinessStats,
  isLivePurchase,
  payerKey,
  periodStart,
  type PurchaseRow,
} from "../services/businessStats";

// Monday 2026-10-12, 15:00 UTC
const NOW = new Date("2026-10-12T15:00:00Z");
const d = (iso: string) => new Date(iso);

describe("UTC buckets and windows (REQ-006)", () => {
  it("buckets days, weeks (Monday start) and months in UTC", () => {
    expect(bucketKey(d("2026-10-11T23:59:59Z"), "day")).toBe("2026-10-11");
    expect(bucketKey(d("2026-10-11T23:59:59Z"), "week")).toBe("2026-10-05"); // Sunday -> previous Monday
    expect(bucketKey(d("2026-10-12T00:00:00Z"), "week")).toBe("2026-10-12"); // Monday
    expect(bucketKey(d("2026-10-31T23:59:59Z"), "month")).toBe("2026-10");
    expect(bucketKey(d("2026-11-01T00:00:00Z"), "month")).toBe("2026-11");
  });

  it("windows are whole UTC days with today included", () => {
    expect(periodStart("7d", NOW)?.toISOString()).toBe("2026-10-06T00:00:00.000Z");
    expect(periodStart("30d", NOW)?.toISOString()).toBe("2026-09-13T00:00:00.000Z");
    expect(periodStart("90d", NOW)?.toISOString()).toBe("2026-07-15T00:00:00.000Z");
    expect(periodStart("all", NOW)).toBeNull();
  });

  it("lists every bucket between two dates without gaps", () => {
    expect(bucketRange(d("2026-10-06T00:00:00Z"), NOW, "day")).toEqual([
      "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12",
    ]);
    expect(bucketRange(d("2026-10-06T00:00:00Z"), NOW, "week")).toEqual(["2026-10-05", "2026-10-12"]);
    expect(bucketRange(d("2026-08-20T00:00:00Z"), NOW, "month")).toEqual(["2026-08", "2026-09", "2026-10"]);
  });
});

describe("live-mode rule (DEC-012)", () => {
  it("uses the livemode field when present", () => {
    expect(isLivePurchase({ id: "cs_test_1", livemode: true })).toBe(true);
    expect(isLivePurchase({ id: "cs_live_1", livemode: false })).toBe(false);
  });
  it("derives livemode from the Stripe session id prefix for legacy purchases", () => {
    expect(isLivePurchase({ id: "cs_live_a1", livemode: null })).toBe(true);
    expect(isLivePurchase({ id: "cs_test_a1" })).toBe(false);
    expect(isLivePurchase({ id: "weird" })).toBe(false);
  });
});

describe("paying-user chain (DEC-012)", () => {
  const base: PurchaseRow = { id: "cs_live_1", amountTotal: 100, currency: "usd", createdAt: NOW };
  it("prefers purchase.ownerUid, then profile.ownerUid, then device ids", () => {
    expect(payerKey({ ...base, ownerUid: "u1", ownerDeviceId: "d1" }, { ownerUid: "u2" })).toBe("uid:u1");
    expect(payerKey({ ...base, ownerDeviceId: "d1" }, { ownerUid: "u2", ownerDeviceId: "d2" })).toBe("uid:u2");
    expect(payerKey({ ...base, ownerDeviceId: "d1" }, { ownerDeviceId: "d2" })).toBe("device:d1");
    expect(payerKey(base, { ownerDeviceId: "d2" })).toBe("device:d2");
    expect(payerKey(base, undefined)).toBeNull();
  });
});

describe("computeBusinessStats", () => {
  const purchases: PurchaseRow[] = [
    { id: "cs_live_a", amountTotal: 399, currency: "usd", createdAt: d("2026-10-12T09:00:00Z"), livemode: true, ownerUid: "u1", profileId: "p1" },
    { id: "cs_live_b", amountTotal: 199, currency: "usd", createdAt: d("2026-10-10T09:00:00Z"), ownerDeviceId: "dev9", profileId: "p2" }, // legacy
    { id: "cs_live_c", amountTotal: 601, currency: "usd", createdAt: d("2026-10-11T09:00:00Z"), ownerDeviceId: "dev1", profileId: "p1" }, // legacy, same owner as u1 via profile
    { id: "cs_live_d", amountTotal: 500, currency: "eur", createdAt: d("2026-10-09T09:00:00Z"), livemode: true, ownerUid: "u3" },
    { id: "cs_test_e", amountTotal: 999, currency: "usd", createdAt: d("2026-10-11T10:00:00Z"), livemode: false, ownerUid: "u4" },
    { id: "cs_live_f", amountTotal: 700, currency: "usd", createdAt: d("2026-08-01T10:00:00Z"), livemode: true, ownerUid: "u5" }, // outside 30d
  ];
  const profiles = new Map([
    ["p1", { ownerUid: "u1", ownerDeviceId: "dev1" }],
    ["p2", { ownerDeviceId: "dev9" }],
  ]);
  const run = (period: "7d" | "30d" | "90d" | "all", grouping: "day" | "week" | "month" = "day") =>
    computeBusinessStats({
      period, grouping, now: NOW, purchases, profiles,
      subscriptionStatuses: ["active", "active", "past_due", "canceled", "paused", "weird"],
      newProfiles: 7,
      spends: [
        { feature: "oracle", stars: 1, createdAt: d("2026-10-12T08:00:00Z") },
        { feature: "oracle", stars: 1, createdAt: d("2026-10-11T08:00:00Z") },
        { feature: "oracle", stars: -1, createdAt: d("2026-10-11T08:00:01Z") }, // refund
        { feature: "interpretations", stars: 4, createdAt: d("2026-10-10T08:00:00Z") },
        { feature: "oracle", stars: 1, createdAt: d("2026-05-01T08:00:00Z") }, // outside 30d
      ],
      firstSpendAt: d("2026-05-01T08:00:00Z"),
    });

  it("reports revenue per currency equal to the sum of live purchases in the window", () => {
    const s = run("30d");
    const usd = s.currencies.find((c) => c.currency === "USD")!;
    const eur = s.currencies.find((c) => c.currency === "EUR")!;
    expect(usd.revenueCents).toBe(399 + 199 + 601);
    expect(usd.purchases).toBe(3);
    expect(eur.revenueCents).toBe(500);
    expect(s.testPurchasesExcluded).toBe(1);
    expect(s.totals.purchases).toBe(4);
  });

  it("includes older purchases for the all-time period", () => {
    const usd = run("all").currencies.find((c) => c.currency === "USD")!;
    expect(usd.revenueCents).toBe(399 + 199 + 601 + 700);
    expect(usd.series[0].bucket).toBe("2026-08-01");
  });

  it("counts paying users once and computes ARPPU per currency", () => {
    const usd = run("30d").currencies.find((c) => c.currency === "USD")!;
    // p1 purchases (ownerUid u1, and legacy dev1 resolved through profile p1 -> u1) are one payer; dev9 is another
    expect(usd.payingUsers).toBe(2);
    expect(usd.arppuCents).toBe(Math.round(1199 / 2));
    expect(run("30d").totals.payingUsers).toBe(3); // u1, dev9 and u3 across currencies
  });

  it("series buckets sum to the revenue and fill empty days", () => {
    const usd = run("7d", "day").currencies.find((c) => c.currency === "USD")!;
    expect(usd.series.map((b) => b.bucket)).toEqual([
      "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12",
    ]);
    expect(usd.series.reduce((n, b) => n + b.revenueCents, 0)).toBe(usd.revenueCents);
    expect(usd.series.find((b) => b.bucket === "2026-10-08")).toMatchObject({ revenueCents: 0, purchases: 0 });
    const weekly = run("30d", "week").currencies.find((c) => c.currency === "USD")!;
    expect(weekly.series.reduce((n, b) => n + b.revenueCents, 0)).toBe(weekly.revenueCents);
  });

  it("sorts currencies by revenue and reports an empty window without crashing", () => {
    expect(run("30d").currencies.map((c) => c.currency)).toEqual(["USD", "EUR"]);
    const empty = computeBusinessStats({
      period: "7d", grouping: "day", now: NOW, purchases: [], profiles: new Map(),
      subscriptionStatuses: [], newProfiles: 0, spends: [], firstSpendAt: null,
    });
    expect(empty.currencies).toEqual([]);
    expect(empty.totals).toEqual({ purchases: 0, payingUsers: 0 });
    expect(empty.starLedgerSince).toBeNull();
  });

  it("counts subscriptions by status and passes new profiles through", () => {
    const s = run("30d");
    expect(s.subscriptions).toEqual({ active: 2, past_due: 1, canceled: 1, paused: 1 });
    expect(s.newProfiles).toBe(7);
  });

  it("nets stars per feature inside the window (refunds subtract) and reports where the ledger starts", () => {
    const s = run("30d");
    expect(s.starsByFeature).toEqual([
      { feature: "interpretations", stars: 4 },
      { feature: "oracle", stars: 1 },
    ]);
    expect(s.starLedgerSince).toBe("2026-05-01T08:00:00.000Z");
  });
});
