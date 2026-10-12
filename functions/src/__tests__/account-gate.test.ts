import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createFakeFirestore, type FakeFirestore } from "./helpers/fakeFirestore";

const h = vi.hoisted(() => ({
  fake: null as unknown as FakeFirestore,
  generate: null as unknown as Mock,
  stripeCreate: null as unknown as Mock,
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => h.fake.db,
  FieldValue: { serverTimestamp: () => "TS" },
}));
vi.mock("../services/anthropic", () => ({
  normalizeLanguage: (l: unknown) => (l === "ru" ? "ru" : "en"),
  buildOraclePrompt: () => "prompt",
  buildRelationshipPrompt: () => "prompt",
  buildDeepInterpretationPrompt: () => "prompt",
  generateClaudeTextResult: (...a: unknown[]) => h.generate(...a),
}));
vi.mock("../services/chartResolver", () => ({
  resolveOwnedChart: async (p: { profileId: string; uid?: string | null; ownerDeviceId?: string | null }) => {
    const snap = await (h.fake.db as any).collection("profiles").doc(p.profileId).get();
    const profile = snap.data();
    const { ownsProfile } = await import("../services/owner");
    if (!profile || !ownsProfile(profile, { uid: p.uid ?? null, deviceId: p.ownerDeviceId ?? null })) {
      const { HttpsError } = await import("firebase-functions/v2/https");
      throw new HttpsError("permission-denied", "Access denied");
    }
    return { profile: { id: p.profileId, ...profile }, chart: {} };
  },
}));
vi.mock("../astro/chart", () => ({ computeNatalChart: () => ({}) }));
vi.mock("../utils/timezone", () => ({ getTimezoneFromCoords: () => "Europe/Berlin" }));
vi.mock("../services/factExtraction", () => ({ extractAndStoreFacts: vi.fn().mockResolvedValue(undefined) }));
vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create: (...a: unknown[]) => h.stripeCreate(...a) } };
  },
}));

import { askOracle } from "../api/askOracle";
import { askRelationship } from "../api/askRelationship";
import { unlockFeature } from "../api/unlockFeature";
import { createCheckoutSession } from "../api/createCheckoutSession";
import { deepenInterpretation } from "../api/deepenInterpretation";
import { deepTextId } from "../services/profileContent";

process.env.STRIPE_SECRET_KEY = "sk_test_x";

type Callable = { run: (req: unknown) => Promise<any> };
const call = (fn: unknown, data: Record<string, unknown>, uid: string | null) =>
  (fn as Callable).run({ data, auth: uid ? { uid } : undefined, rawRequest: { headers: { origin: "https://natalmystic.com" } } });

const partner = { name: "Alex", birthDate: "1991-02-03", birthTime: "10:00", timeUnknown: false, birthPlace: "Berlin", lat: 52.5, lng: 13.4 };
const tokens = (key: string) => h.fake.all("wallets").get(key)?.tokens;
const oracleItems = () => h.fake.all("oracleHistory/p1/items");

beforeEach(() => {
  h.fake = createFakeFirestore();
  h.generate = vi.fn().mockResolvedValue({ text: "An answer.", model: "claude" });
  h.stripeCreate = vi.fn().mockResolvedValue({ url: "https://checkout.stripe.test/s" });
  h.fake.seed("profiles", "p1", { ownerUid: "u1", ownerDeviceId: "d1", name: "A", birthDate: "1990-01-01", lat: 1, lng: 2, timezone: "UTC" });
  h.fake.seed("profiles", "pd", { ownerDeviceId: "d1", name: "Anon", hasPremiumPdf: true, birthDate: "1990-01-01", lat: 1, lng: 2, timezone: "UTC" });
  h.fake.seed("wallets", "u1", { tokens: 10 });
  h.fake.seed("wallets", "device:d1", { tokens: 10 });
});

describe("paid endpoints require an account (REQ-004, REQ-006)", () => {
  const anon = { ownerDeviceId: "d1" };
  const cases: Array<[string, unknown, Record<string, unknown>]> = [
    ["askOracle", askOracle, { ...anon, profileId: "pd", question: "Q?" }],
    ["askRelationship", askRelationship, { ...anon, profileId: "pd", partner }],
    ["unlockFeature", unlockFeature, { ...anon, profileId: "pd", feature: "interpretations" }],
    ["createCheckoutSession", createCheckoutSession, { ...anon, profileId: "pd", packId: "reading" }],
  ];
  for (const [name, fn, data] of cases) {
    it(`${name} rejects a deviceId-only caller before any charge or write`, async () => {
      await expect(call(fn, data, null)).rejects.toMatchObject({ code: "unauthenticated" });
      expect(tokens("device:d1")).toBe(10);
      expect(h.fake.all("starSpends").size).toBe(0);
      expect(h.fake.all("oracleHistory/pd/items").size).toBe(0);
      expect(h.generate).not.toHaveBeenCalled();
      expect(h.stripeCreate).not.toHaveBeenCalled();
    });
  }

  it("free features stay open to anonymous owners (deepen on an old unlocked profile), but nothing is stored server-side", async () => {
    const r = await call(deepenInterpretation, { profileId: "pd", ownerDeviceId: "d1", focusTopic: "Sun", baseInterpretation: "Base", blockKey: "sun" }, null);
    expect(r).toMatchObject({ text: "An answer.", persisted: false });
    expect(h.fake.all("deepTexts/pd/items").size).toBe(0);
  });
});

describe("askOracle for a signed-in owner (REQ-004)", () => {
  it("spends one star and stores the Q/A server-side, returning its id", async () => {
    const r = await call(askOracle, { profileId: "p1", question: "Will I travel?" }, "u1");
    expect(tokens("u1")).toBe(9);
    expect(r.persisted).toBe(true);
    expect(oracleItems().get(r.entryId)).toMatchObject({ question: "Will I travel?", answer: "An answer.", channel: "web" });
  });

  it("refunds and stores nothing when the answer fails", async () => {
    h.generate.mockRejectedValueOnce(new Error("boom"));
    await expect(call(askOracle, { profileId: "p1", question: "Q?" }, "u1")).rejects.toBeTruthy();
    expect(tokens("u1")).toBe(10);
    expect(oracleItems().size).toBe(0);
  });

  it("refuses an account that does not own the profile, without charging it", async () => {
    h.fake.seed("wallets", "u2", { tokens: 3 });
    await expect(call(askOracle, { profileId: "p1", question: "Q?" }, "u2")).rejects.toMatchObject({ code: "permission-denied" });
    expect(tokens("u2")).toBe(3);
  });
});

describe("askRelationship for a signed-in owner (REQ-002)", () => {
  it("charges two stars and stores the reading under the profile", async () => {
    const r = await call(askRelationship, { profileId: "p1", partner }, "u1");
    expect(tokens("u1")).toBe(8);
    expect(r).toMatchObject({ persisted: true, partnerTimezone: "Europe/Berlin" });
    const stored = h.fake.all("compatibilityReadings/p1/items").get(r.readingId);
    expect(stored).toMatchObject({ partnerName: "Alex", partnerBirthDate: "1991-02-03", partnerBirthPlace: "Berlin", answer: "An answer." });
  });

  it("refunds and stores nothing when generation fails", async () => {
    h.generate.mockRejectedValueOnce(new Error("boom"));
    await expect(call(askRelationship, { profileId: "p1", partner }, "u1")).rejects.toBeTruthy();
    expect(tokens("u1")).toBe(10);
    expect(h.fake.all("compatibilityReadings/p1/items").size).toBe(0);
  });
});

describe("deepenInterpretation for a signed-in owner (REQ-003)", () => {
  it("stores the text per block without charging stars", async () => {
    h.fake.seed("profiles", "p1", { ownerUid: "u1", ownerDeviceId: "d1", name: "A", hasPremiumPdf: true, birthDate: "1990-01-01", lat: 1, lng: 2, timezone: "UTC" });
    const r = await call(deepenInterpretation, { profileId: "p1", ownerDeviceId: "d1", focusTopic: "Sun", baseInterpretation: "Base", blockKey: "sun-in-aries", language: "ru" }, "u1");
    expect(r.persisted).toBe(true);
    expect(h.fake.all("deepTexts/p1/items").get(deepTextId("sun-in-aries"))).toMatchObject({ blockKey: "sun-in-aries", text: "An answer.", language: "ru" });
    expect(tokens("u1")).toBe(10);
  });
});

describe("unlock and checkout for a signed-in owner (REQ-006)", () => {
  it("unlockFeature charges the account wallet", async () => {
    const r = await call(unlockFeature, { profileId: "p1", feature: "interpretations" }, "u1");
    expect(r).toMatchObject({ ok: true, alreadyUnlocked: false });
    expect(tokens("u1")).toBe(6);
  });

  it("createCheckoutSession creates a session for the account", async () => {
    const r = await call(createCheckoutSession, { profileId: "p1", ownerDeviceId: "d1", packId: "reading" }, "u1");
    expect(r.url).toContain("checkout");
    expect(h.stripeCreate.mock.calls[0][0].metadata.walletKey).toBe("u1");
  });
});
