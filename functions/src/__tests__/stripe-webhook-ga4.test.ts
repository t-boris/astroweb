import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeFirestore, type FakeFirestore } from "./helpers/fakeFirestore";

const h = vi.hoisted(() => ({
  fake: null as unknown as FakeFirestore,
  subscriptionMetadata: {} as Record<string, string>,
}));

vi.mock("stripe", () => ({
  default: class {
    webhooks = { constructEvent: (body: Buffer) => JSON.parse(body.toString()) };
    subscriptions = { retrieve: async () => ({ metadata: h.subscriptionMetadata, current_period_end: 1_900_000_000 }) };
  },
}));
vi.mock("firebase-admin", () => ({
  firestore: Object.assign(() => h.fake.db, { FieldValue: { serverTimestamp: () => "TS", increment: (n: number) => n } }),
}));
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => h.fake.db,
  FieldValue: { serverTimestamp: () => "TS" },
}));
vi.mock("../services/profile", () => ({ getProfileById: vi.fn().mockResolvedValue(null) }));
vi.mock("../services/letterEngine", () => ({ enqueueImmediateLetter: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../services/email", () => ({ parseRecipientEmails: () => [] }));

import { stripeWebhook } from "../api/stripeWebhook";
import { pseudoClientId } from "../services/ga4";

process.env.STRIPE_SECRET_KEY = "sk_test_x";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_x";
process.env.GA_MEASUREMENT_ID = "G-TEST";
process.env.GA_API_SECRET = "gasecret";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

async function deliver(event: Record<string, unknown>) {
  const req = { headers: { "stripe-signature": "sig" }, rawBody: Buffer.from(JSON.stringify(event)) };
  const res = { status: vi.fn().mockReturnThis(), send: vi.fn(), json: vi.fn() };
  await (stripeWebhook as unknown as (a: unknown, b: unknown) => Promise<void>)(req, res);
  return res;
}

const sentRequests = () => fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));

function packSession(over: Record<string, unknown> = {}, metadata: Record<string, string> = {}) {
  return {
    id: "evt_1",
    type: "checkout.session.completed",
    livemode: true,
    data: {
      object: {
        id: "cs_live_abc123",
        livemode: true,
        amount_total: 399,
        currency: "usd",
        payment_status: "paid",
        customer_details: { email: "buyer@example.com" },
        metadata: { profileId: "p1", ownerDeviceId: "dev1", walletKey: "uid-1", tokens: "4", packId: "reading", ...metadata },
        ...over,
      },
    },
  };
}

describe("stripeWebhook -> GA4 (REQ-002)", () => {
  beforeEach(() => {
    h.fake = createFakeFirestore();
    h.subscriptionMetadata = {};
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 204 });
    h.fake.seed("wallets", "uid-1", { tokens: 0 });
  });

  it("sends purchase with the real client_id and uid when consent was granted", async () => {
    await deliver(packSession({}, { ga_consent: "granted", ga_client_id: "111.222", ga_uid: "uid-1" }));
    const [req] = sentRequests();
    expect(req.client_id).toBe("111.222");
    expect(req.user_id).toBe("uid-1");
    expect(req.events[0]).toMatchObject({
      name: "purchase",
      params: { transaction_id: "cs_live_abc123", value: 3.99, currency: "USD" },
    });
    expect(req.events[0].params.items[0].item_id).toBe("reading");
  });

  it("sends anonymously with a hashed client_id when consent is not granted", async () => {
    await deliver(packSession({}, { ga_consent: "denied" }));
    const [req] = sentRequests();
    expect(req.client_id).toBe(pseudoClientId("cs_live_abc123"));
    expect(req.client_id).not.toContain("cs_live_abc123");
    expect(req.user_id).toBeUndefined();
    expect(JSON.stringify(req)).not.toContain("uid-1");
    expect(JSON.stringify(req)).not.toContain("buyer@example.com");
  });

  it("treats sessions with no analytics metadata (created before this change) as anonymous", async () => {
    await deliver(packSession());
    expect(sentRequests()[0].client_id).toBe(pseudoClientId("cs_live_abc123"));
  });

  it("does not duplicate the purchase or the GA4 event on redelivery", async () => {
    await deliver(packSession({}, { ga_consent: "granted", ga_client_id: "111.222" }));
    await deliver(packSession({}, { ga_consent: "granted", ga_client_id: "111.222" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(h.fake.all("purchases").size).toBe(1);
    expect(h.fake.all("wallets").get("uid-1")?.tokens).toBe(4);
  });

  it("persists livemode, walletKey, ownerUid and packId on the purchase", async () => {
    await deliver(packSession());
    expect(h.fake.all("purchases").get("cs_live_abc123")).toMatchObject({
      livemode: true,
      walletKey: "uid-1",
      ownerUid: "uid-1",
      packId: "reading",
      amountTotal: 399,
      currency: "usd",
    });
  });

  it("leaves ownerUid empty for an anonymous device wallet", async () => {
    await deliver(packSession({}, { walletKey: "device:dev1" }));
    expect(h.fake.all("purchases").get("cs_live_abc123")).toMatchObject({ walletKey: "device:dev1", ownerUid: null });
  });

  it("records test-mode purchases with livemode false and sends nothing to GA4", async () => {
    await deliver({ ...packSession({ id: "cs_test_zzz", livemode: false }), livemode: false });
    expect(h.fake.all("purchases").get("cs_test_zzz")).toMatchObject({ livemode: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still answers 200 and keeps the purchase when GA4 is down, then retries on redelivery", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    const res = await deliver(packSession());
    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(h.fake.all("purchases").size).toBe(1);
    expect(h.fake.all("ga4Events").size).toBe(0);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 204 });
    await deliver(packSession());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(h.fake.all("purchases").size).toBe(1);
  });

  describe("astrologer subscription", () => {
    const startEvent = (meta: Record<string, string>) => ({
      id: "evt_start",
      type: "checkout.session.completed",
      livemode: true,
      data: {
        object: {
          id: "cs_live_sub1",
          livemode: true,
          subscription: "sub_1",
          amount_total: 999,
          currency: "usd",
          payment_status: "paid",
          metadata: { kind: "astrologer", profileId: "p1", ownerUid: "uid-1", cadence: "weekly", period: "monthly", ...meta },
        },
      },
    });

    it("start: real ids when consent was recorded at checkout", async () => {
      await deliver(startEvent({ ga_consent: "granted", ga_client_id: "5.6", ga_uid: "uid-1" }));
      const [req] = sentRequests();
      expect(req.client_id).toBe("5.6");
      expect(req.user_id).toBe("uid-1");
      expect(req.events[0]).toMatchObject({
        name: "subscription_start",
        params: { transaction_id: "cs_live_sub1", value: 9.99, cadence: "weekly", billing_period: "monthly" },
      });
      expect(h.fake.all("subscriptions").get("p1")).toMatchObject({ status: "active", providerRef: "sub_1" });
    });

    it("start: anonymous without consent, hashed from the checkout session id", async () => {
      await deliver(startEvent({ ga_consent: "denied" }));
      const [req] = sentRequests();
      expect(req.client_id).toBe(pseudoClientId("cs_live_sub1"));
      expect(req.user_id).toBeUndefined();
    });

    const renewal = (billingReason: string) => ({
      id: "evt_inv",
      type: "invoice.payment_succeeded",
      livemode: true,
      data: { object: { id: "in_42", subscription: "sub_1", billing_reason: billingReason, amount_paid: 999, currency: "usd", lines: { data: [] } } },
    });

    it("renewal: reads consent and ids from the subscription metadata, not the current client", async () => {
      h.fake.seed("subscriptions", "p1", { providerRef: "sub_1", cadence: "weekly", billingPeriod: "monthly" });
      h.subscriptionMetadata = { ga_consent: "granted", ga_client_id: "5.6", ga_uid: "uid-1", cadence: "weekly", period: "monthly" };
      await deliver(renewal("subscription_cycle"));
      const [req] = sentRequests();
      expect(req.client_id).toBe("5.6");
      expect(req.user_id).toBe("uid-1");
      expect(req.events[0]).toMatchObject({ name: "subscription_renewal", params: { transaction_id: "in_42", value: 9.99 } });
    });

    it("renewal: anonymous, hashed from the invoice id, when the subscription has no consent", async () => {
      h.fake.seed("subscriptions", "p1", { providerRef: "sub_1", cadence: "weekly", billingPeriod: "monthly" });
      h.subscriptionMetadata = {}; // subscription created before this change
      await deliver(renewal("subscription_cycle"));
      const [req] = sentRequests();
      expect(req.client_id).toBe(pseudoClientId("in_42"));
      expect(req.user_id).toBeUndefined();
      expect(req.events[0].params.cadence).toBe("weekly"); // taken from the Firestore subscription
    });

    it("renewal: the first invoice is not reported twice, and redelivery sends nothing", async () => {
      h.fake.seed("subscriptions", "p1", { providerRef: "sub_1" });
      await deliver(renewal("subscription_create"));
      expect(fetchMock).not.toHaveBeenCalled();
      await deliver(renewal("subscription_cycle"));
      await deliver(renewal("subscription_cycle"));
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const cancel = (meta: Record<string, string>) => ({
      id: "evt_cancel",
      type: "customer.subscription.deleted",
      livemode: true,
      data: { object: { id: "sub_1", metadata: meta } },
    });

    it("cancel: uses subscription metadata and event-id transaction_id; marks the subscription canceled", async () => {
      h.fake.seed("subscriptions", "p1", { providerRef: "sub_1", status: "active" });
      await deliver(cancel({ kind: "astrologer", cadence: "daily", period: "annual", ga_consent: "granted", ga_client_id: "7.8" }));
      const [req] = sentRequests();
      expect(req.client_id).toBe("7.8");
      expect(req.events[0]).toMatchObject({ name: "subscription_cancel", params: { transaction_id: "evt_cancel", cadence: "daily" } });
      expect(req.events[0].params.value).toBeUndefined();
      expect(h.fake.all("subscriptions").get("p1")).toMatchObject({ status: "canceled" });
    });

    it("cancel: anonymous, hashed from subscription id + event id, without consent metadata", async () => {
      h.fake.seed("subscriptions", "p1", { providerRef: "sub_1", status: "active" });
      await deliver(cancel({}));
      const [req] = sentRequests();
      expect(req.client_id).toBe(pseudoClientId("sub_1:evt_cancel"));
      expect(req.user_id).toBeUndefined();
    });

    it("cancel: withdrawing consent on the site later changes nothing — metadata is the only source", async () => {
      h.fake.seed("subscriptions", "p1", { providerRef: "sub_1" });
      await deliver(cancel({ ga_consent: "granted", ga_client_id: "7.8", ga_uid: "uid-1" }));
      expect(sentRequests()[0]).toMatchObject({ client_id: "7.8", user_id: "uid-1" });
    });
  });
});
