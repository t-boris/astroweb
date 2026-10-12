import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeFirestore, type FakeFirestore } from "./helpers/fakeFirestore";

const holder = vi.hoisted(() => ({ fake: null as unknown as FakeFirestore }));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => holder.fake.db,
  FieldValue: { serverTimestamp: () => "TS" },
}));

import {
  analyticsMetadata,
  buildGa4Request,
  parseClientAnalytics,
  pseudoClientId,
  purchaseEvent,
  readAnalyticsMetadata,
  sendGa4,
  sendGa4Once,
  subscriptionEvent,
} from "../services/ga4";

describe("pseudoClientId (DEC-005)", () => {
  it("is GA-shaped, deterministic and different per seed", () => {
    const a = pseudoClientId("cs_live_a1b2c3");
    expect(a).toMatch(/^\d{10}\.\d{10}$/);
    expect(pseudoClientId("cs_live_a1b2c3")).toBe(a);
    expect(pseudoClientId("cs_live_other")).not.toBe(a);
  });

  it("never equals or contains the raw Stripe identifier", () => {
    for (const seed of ["cs_live_a1b2c3", "in_1Oxyz", "sub_1Abc:evt_1Def"]) {
      const id = pseudoClientId(seed);
      expect(id).not.toBe(seed);
      expect(id.includes(seed)).toBe(false);
    }
  });
});

describe("client analytics <-> Stripe metadata (REQ-002)", () => {
  it("keeps client_id and uid only when consent is granted", () => {
    const granted = parseClientAnalytics({ consent: "granted", clientId: "1234567890.1700000000" });
    expect(analyticsMetadata(granted, "uid-1")).toEqual({
      ga_consent: "granted",
      ga_client_id: "1234567890.1700000000",
      ga_uid: "uid-1",
    });
    const denied = parseClientAnalytics({ consent: "denied", clientId: "1234567890.1700000000" });
    expect(analyticsMetadata(denied, "uid-1")).toEqual({ ga_consent: "denied" });
  });

  it("rejects malformed client ids and non-objects", () => {
    expect(parseClientAnalytics({ consent: "granted", clientId: "evil; drop" })).toEqual({ consent: true, clientId: null });
    expect(parseClientAnalytics(undefined)).toEqual({ consent: false, clientId: null });
    expect(parseClientAnalytics("granted")).toEqual({ consent: false, clientId: null });
  });

  it("round-trips through readAnalyticsMetadata and ignores metadata without consent", () => {
    const md = analyticsMetadata({ consent: true, clientId: "1.2" }, "u");
    expect(readAnalyticsMetadata(md)).toEqual({ consent: true, clientId: "1.2", uid: "u" });
    expect(readAnalyticsMetadata({ ga_consent: "denied", ga_client_id: "1.2", ga_uid: "u" })).toEqual({
      consent: false,
      clientId: "1.2",
      uid: null,
    });
    // Subscriptions created before this change have no metadata -> not consented.
    expect(readAnalyticsMetadata(undefined)).toEqual({ consent: false, clientId: null, uid: null });
  });
});

describe("buildGa4Request", () => {
  const event = purchaseEvent({ transactionId: "cs_live_1", amountCents: 399, currency: "usd", packId: "reading", stars: 4 });

  it("uses the real client_id and user_id with consent granted", () => {
    const req = buildGa4Request({ consent: true, clientId: "111.222", uid: "uid-1" }, "cs_live_1", event);
    expect(req.client_id).toBe("111.222");
    expect(req.user_id).toBe("uid-1");
  });

  it("omits user_id when the buyer was signed out", () => {
    const req = buildGa4Request({ consent: true, clientId: "111.222", uid: null }, "cs_live_1", event);
    expect(req.user_id).toBeUndefined();
  });

  it("is anonymous without consent: pseudo client_id, no user_id", () => {
    const req = buildGa4Request({ consent: false, clientId: "111.222", uid: "uid-1" }, "cs_live_1", event);
    expect(req.client_id).toBe(pseudoClientId("cs_live_1"));
    expect(req.user_id).toBeUndefined();
    expect(JSON.stringify(req)).not.toContain("uid-1");
    expect(JSON.stringify(req)).not.toContain("111.222");
  });

  it("treats granted consent without a real client_id as anonymous", () => {
    const req = buildGa4Request({ consent: true, clientId: null, uid: "uid-1" }, "cs_live_1", event);
    expect(req.client_id).toBe(pseudoClientId("cs_live_1"));
    expect(req.user_id).toBeUndefined();
  });
});

describe("event payloads", () => {
  it("builds a GA4 purchase with transaction_id, value, currency and items", () => {
    expect(purchaseEvent({ transactionId: "cs_1", amountCents: 1999, currency: "usd", packId: "all", stars: 8 })).toEqual({
      name: "purchase",
      params: {
        transaction_id: "cs_1",
        value: 19.99,
        currency: "USD",
        items: [{ item_id: "all", item_name: "AstroWeb · all", item_category: "stars", price: 19.99, quantity: 1 }],
      },
    });
  });

  it("falls back to a stars-based item id for legacy quantity sessions", () => {
    const e = purchaseEvent({ transactionId: "cs_2", amountCents: 297, currency: "usd", packId: undefined, stars: 3 });
    expect((e.params.items as Array<{ item_id: string }>)[0].item_id).toBe("stars_3");
  });

  it("subscription start and renewal carry value, cancel does not", () => {
    const start = subscriptionEvent("subscription_start", { transactionId: "cs_3", amountCents: 999, currency: "usd", cadence: "weekly", billingPeriod: "monthly" });
    expect(start.params).toMatchObject({ transaction_id: "cs_3", value: 9.99, currency: "USD", cadence: "weekly", billing_period: "monthly" });
    const cancel = subscriptionEvent("subscription_cancel", { transactionId: "evt_1", cadence: "weekly" });
    expect(cancel.params).toEqual({ transaction_id: "evt_1", cadence: "weekly" });
  });

  it("only uses allowlisted parameter keys (no name, email or birth data)", () => {
    const allowed = new Set([
      "transaction_id", "value", "currency", "items", "cadence", "billing_period",
      "item_id", "item_name", "item_category", "price", "quantity",
    ]);
    const keys = (o: unknown): string[] =>
      Array.isArray(o) ? o.flatMap(keys) : o && typeof o === "object" ? Object.entries(o).flatMap(([k, v]) => [k, ...keys(v)]) : [];
    const events = [
      purchaseEvent({ transactionId: "cs_1", amountCents: 100, currency: "usd", packId: "question", stars: 1 }),
      subscriptionEvent("subscription_start", { transactionId: "cs_1", amountCents: 100, currency: "usd", cadence: "daily", billingPeriod: "annual" }),
      subscriptionEvent("subscription_cancel", { transactionId: "evt_1", cadence: "daily" }),
    ];
    for (const e of events) {
      expect(keys(e.params).filter((k) => !allowed.has(k))).toEqual([]);
    }
  });
});

describe("sendGa4", () => {
  const cfg = { measurementId: "G-TEST", apiSecret: "s3cret" };
  const req = buildGa4Request({ consent: false, clientId: null, uid: null }, "x", purchaseEvent({ transactionId: "t", amountCents: 100, currency: "usd", packId: "question", stars: 1 }));

  it("posts JSON to the Measurement Protocol with the measurement id and secret", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    expect(await sendGa4(req, cfg, fetchImpl)).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://www.google-analytics.com/mp/collect?measurement_id=G-TEST&api_secret=s3cret");
    expect(JSON.parse(init.body)).toEqual(req);
  });

  it("retries once on a network error and then succeeds", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ ok: true, status: 204 });
    expect(await sendGa4(req, cfg, fetchImpl)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 4xx and never throws", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    expect(await sendGa4(req, cfg, fetchImpl)).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const failing = vi.fn().mockRejectedValue(new Error("down"));
    expect(await sendGa4(req, cfg, failing)).toBe(false);
  });

  it("skips quietly when GA4 is not configured", async () => {
    const fetchImpl = vi.fn();
    expect(await sendGa4(req, { measurementId: undefined, apiSecret: undefined }, fetchImpl)).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("sendGa4Once", () => {
  beforeEach(() => {
    holder.fake = createFakeFirestore();
  });
  const event = purchaseEvent({ transactionId: "cs_live_9", amountCents: 100, currency: "usd", packId: "question", stars: 1 });
  const noConsent = { consent: false, clientId: null, uid: null };

  it("sends once and not again on a redelivery", async () => {
    const send = vi.fn().mockResolvedValue(true);
    expect(await sendGa4Once(event, noConsent, "cs_live_9", { send })).toBe("sent");
    expect(await sendGa4Once(event, noConsent, "cs_live_9", { send })).toBe("duplicate");
    expect(send).toHaveBeenCalledTimes(1);
    expect(holder.fake.all("ga4Events").size).toBe(1);
  });

  it("retries on redelivery when the first attempt failed", async () => {
    const send = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect(await sendGa4Once(event, noConsent, "cs_live_9", { send })).toBe("failed");
    expect(holder.fake.all("ga4Events").size).toBe(0);
    expect(await sendGa4Once(event, noConsent, "cs_live_9", { send })).toBe("sent");
  });

  it("produces the same client_id and transaction_id on every attempt", async () => {
    const send = vi.fn().mockResolvedValue(false);
    await sendGa4Once(event, noConsent, "cs_live_9", { send });
    await sendGa4Once(event, noConsent, "cs_live_9", { send });
    const [a, b] = send.mock.calls.map((c) => c[0]);
    expect(a.client_id).toBe(b.client_id);
    expect(a.events[0].params.transaction_id).toBe(b.events[0].params.transaction_id);
  });

  it("keeps the marker free of identifiers", async () => {
    await sendGa4Once(event, { consent: true, clientId: "1.2", uid: "uid-1" }, "cs_live_9", { send: vi.fn().mockResolvedValue(true) });
    const marker = [...holder.fake.all("ga4Events").values()][0];
    expect(JSON.stringify(marker)).not.toContain("uid-1");
    expect(marker.anonymous).toBe(false);
  });
});
