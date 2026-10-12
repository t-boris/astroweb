import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeFirestore, type FakeFirestore } from "./helpers/fakeFirestore";

const h = vi.hoisted(() => ({ fake: null as unknown as FakeFirestore }));

const ts = (iso: string) => {
  const date = new Date(iso);
  return { __ts: date.getTime(), toDate: () => date };
};

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => h.fake.db,
  FieldValue: { serverTimestamp: () => "TS" },
  Timestamp: { fromDate: (date: Date) => ({ __ts: date.getTime(), toDate: () => date }) },
}));
vi.mock("firebase-admin/auth", () => ({ getAuth: () => ({}) }));

import { adminStats } from "../api/admin";
import { loadBusinessStats } from "../services/businessStatsLoader";

type Callable = { run: (req: unknown) => Promise<any> };
const call = (auth: unknown, data: Record<string, unknown> = {}) =>
  (adminStats as unknown as Callable).run({ auth, data });
const admin = { uid: "admin", token: { email: "t.boris@gmail.com", email_verified: true } };

describe("adminStats callable (REQ-006)", () => {
  beforeEach(() => {
    h.fake = createFakeFirestore();
  });

  it("rejects an unauthenticated caller", async () => {
    await expect(call(undefined)).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("rejects a signed-in non-admin", async () => {
    await expect(call({ uid: "x", token: { email: "someone@example.com", email_verified: true } })).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("rejects the admin address when the email is not verified", async () => {
    await expect(call({ uid: "x", token: { email: "t.boris@gmail.com", email_verified: false } })).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("rejects an invalid period or grouping", async () => {
    await expect(call(admin, { period: "1y" })).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(call(admin, { grouping: "hour" })).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("returns stats to the admin", async () => {
    const res = await call(admin, { period: "7d", grouping: "week" });
    expect(res).toMatchObject({ period: "7d", grouping: "week", currencies: [], newProfiles: 0 });
  });
});

describe("loadBusinessStats reads Firestore the way the rules say (REQ-006, REQ-009)", () => {
  const now = new Date("2026-10-12T15:00:00Z");
  beforeEach(() => {
    h.fake = createFakeFirestore();
    const f = h.fake;
    f.seed("profiles", "p1", { ownerUid: "u1", ownerDeviceId: "dev1", createdAt: "2026-10-11T10:00:00.000Z" });
    f.seed("profiles", "p2", { ownerDeviceId: "dev9", createdAt: "2026-10-12T10:00:00.000Z" });
    f.seed("profiles", "p3", { ownerDeviceId: "dev3", createdAt: "2026-01-01T10:00:00.000Z" });
    f.seed("purchases", "cs_live_1", { amountTotal: 399, currency: "usd", createdAt: ts("2026-10-12T09:00:00Z"), livemode: true, ownerUid: "u1", profileId: "p1" });
    f.seed("purchases", "cs_live_2", { amountTotal: 199, currency: "usd", createdAt: ts("2026-10-11T09:00:00Z"), ownerDeviceId: "dev9", profileId: "p2" });
    f.seed("purchases", "cs_test_3", { amountTotal: 999, currency: "usd", createdAt: ts("2026-10-11T09:00:00Z"), livemode: false, profileId: "p2" });
    f.seed("purchases", "cs_live_old", { amountTotal: 500, currency: "usd", createdAt: ts("2026-02-01T09:00:00Z"), livemode: true, profileId: "p3" });
    f.seed("subscriptions", "p1", { status: "active" });
    f.seed("subscriptions", "p2", { status: "canceled" });
    f.seed("starSpends", "s1", { feature: "oracle", stars: 1, createdAt: ts("2026-10-12T08:00:00Z") });
    f.seed("starSpends", "s2", { feature: "oracle", stars: -1, createdAt: ts("2026-10-12T08:00:05Z") });
    f.seed("starSpends", "s3", { feature: "letter", stars: 1, createdAt: ts("2026-03-01T08:00:00Z") });
  });

  it("limits money, profiles and stars to the window and keeps legacy purchases (no livemode)", async () => {
    const s = await loadBusinessStats("30d", "day", now);
    const usd = s.currencies[0];
    expect(usd.currency).toBe("USD");
    expect(usd.revenueCents).toBe(399 + 199); // legacy cs_live_2 counted, cs_test_3 and the old one excluded
    expect(usd.payingUsers).toBe(2);
    expect(s.testPurchasesExcluded).toBe(1);
    expect(s.newProfiles).toBe(2);
    expect(s.subscriptions).toMatchObject({ active: 1, canceled: 1 });
    expect(s.starsByFeature).toEqual([{ feature: "oracle", stars: 0 }]);
    expect(s.starLedgerSince).toBe("2026-03-01T08:00:00.000Z");
  });

  it("all-time includes everything live and every profile", async () => {
    const s = await loadBusinessStats("all", "month", now);
    expect(s.currencies[0].revenueCents).toBe(399 + 199 + 500);
    expect(s.newProfiles).toBe(3);
    expect(s.starsByFeature.find((x) => x.feature === "letter")?.stars).toBe(1);
  });
});
