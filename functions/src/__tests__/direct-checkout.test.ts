import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createFakeFirestore, type FakeFirestore } from "./helpers/fakeFirestore";

const h = vi.hoisted(() => ({
  fake: null as unknown as FakeFirestore,
  runTask: null as unknown as Mock,
  stripeSessionsCreate: null as unknown as Mock,
  stripeSessionsRetrieve: null as unknown as Mock,
  fetchMock: null as unknown as Mock,
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => h.fake.db,
  FieldValue: { serverTimestamp: () => ({ __ts: Date.now(), toDate: () => new Date() }) },
}));

vi.mock("firebase-admin", () => ({
  firestore: Object.assign(() => h.fake.db, {
    FieldValue: {
      serverTimestamp: () => ({ __ts: Date.now(), toDate: () => new Date() }),
      increment: (n: number) => n,
    },
  }),
}));

vi.mock("stripe", () => ({
  default: class MockStripe {
    checkout = {
      sessions: {
        create: (...a: unknown[]) => h.stripeSessionsCreate(...a),
        retrieve: (...a: unknown[]) => h.stripeSessionsRetrieve(...a),
      },
    };
    webhooks = {
      constructEvent: (raw: unknown) => raw,
    };
  },
}));

vi.mock("../services/chartResolver", () => ({
  resolveOwnedChart: async (p: { profileId: string }) => {
    const snap = await (h.fake.db as any).collection("profiles").doc(p.profileId).get();
    return {
      profile: { id: p.profileId, ...snap.data() },
      chart: {
        meta: { houseSystem: "koch", zodiac: "tropical", timeUsed: "12:00", timezoneUsed: "UTC" },
        points: [{ body: "Sun", lon: 15, sign: "Aries", degreeInSign: 15, house: 1 }],
        houses: { system: "koch", cusps: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330], asc: 0, mc: 270 },
        aspects: [],
      },
    };
  },
}));

vi.mock("../astro/chart", () => ({
  computeNatalChart: () => ({
    meta: { houseSystem: "koch", zodiac: "tropical", timeUsed: "12:00", timezoneUsed: "UTC" },
    points: [{ body: "Sun", lon: 195, sign: "Libra", degreeInSign: 15, house: 7 }],
    houses: { system: "koch", cusps: [], asc: null, mc: null },
    aspects: [],
  }),
}));

vi.mock("../services/ai/run", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/ai/run")>()),
  runTask: (...a: unknown[]) => h.runTask(...a),
}));

vi.mock("../services/factExtraction", () => ({
  extractAndStoreFacts: async () => undefined,
}));

import {
  cancelDirectCheckout,
  createDirectCheckout,
  fulfillDirectOrder,
  getDirectCheckoutQuote,
  listProfileHoroscopes,
} from "../api/directCheckout";
import {
  confirmPaidDirectOrder,
  listProfileHoroscopesAndOrders,
  recordCompletedStarOrderPurchase,
  type DirectOrderDoc,
} from "../services/directOrders";
import { computeBusinessStats, type PurchaseRow } from "../services/businessStats";
import { clearTaskSettingsCache } from "../services/ai/settings";

type Callable = { run: (req: unknown) => Promise<any> };
const call = (fn: unknown, auth: unknown, data: Record<string, unknown> = {}) =>
  (fn as Callable).run({
    auth,
    data,
    rawRequest: { headers: { origin: "https://natalmystic.com" } },
  });

const owner = { uid: "u1" };
const stranger = { uid: "u2" };
const partner = {
  name: "Max",
  birthDate: "1991-05-10",
  birthTime: "10:15",
  timeUnknown: false,
  birthPlace: "Berlin, Germany",
  lat: 52.52,
  lng: 13.4,
};

beforeEach(() => {
  h.fake = createFakeFirestore();
  clearTaskSettingsCache();
  process.env.STRIPE_SECRET_KEY = "sk_live_test";
  process.env.FUNCTIONS_EMULATOR = "false";
  process.env.GA_MEASUREMENT_ID = "G-TEST123";
  process.env.GA_API_SECRET = "secret-123";
  process.env.ANTHROPIC_API_KEY = "sk-ant-api03-abcdefghijklmnop";

  h.fake.seed("profiles", "p1", {
    id: "p1",
    ownerUid: "u1",
    ownerDeviceId: "dev1",
    name: "Anna",
    birthDate: "1990-04-02",
    birthTime: "14:30",
    timeUnknown: false,
    birthPlace: "Moscow, Russia",
    lat: 55.75,
    lng: 37.62,
    timezone: "Europe/Moscow",
  });

  h.runTask = vi.fn().mockResolvedValue({
    text: "Forecast body covering the requested dates.",
    model: "claude-sonnet-4-6",
    provider: "anthropic",
    usage: { inputTokens: 100, outputTokens: 200, webSearches: 0 },
    costUsd: 0.004,
  });

  let sessionSeq = 0;
  h.stripeSessionsCreate = vi.fn().mockImplementation(async (args: any) => {
    sessionSeq += 1;
    return {
      id: `cs_live_${sessionSeq}`,
      url: `https://checkout.stripe.com/pay/cs_live_${sessionSeq}`,
      amount_total: args.line_items[0].price_data.unit_amount,
    };
  });
  h.stripeSessionsRetrieve = vi.fn().mockResolvedValue({
    id: "cs_live_1",
    payment_status: "paid",
    payment_intent: "pi_1",
    amount_total: 299,
    currency: "usd",
    livemode: true,
    customer_details: { email: "anna@example.com" },
  });

  h.fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
  vi.stubGlobal("fetch", h.fetchMock);
});

describe("sign-in and profile ownership gates (REQ-005 AC #16)", () => {
  it("rejects unauthenticated callers on all paid direct-checkout callables", async () => {
    await expect(call(getDirectCheckoutQuote, undefined, { profileId: "p1", service: "monthly_horoscope" })).rejects.toMatchObject({
      code: "unauthenticated",
    });
    await expect(call(createDirectCheckout, undefined, { profileId: "p1", service: "monthly_horoscope" })).rejects.toMatchObject({
      code: "unauthenticated",
    });
    await expect(call(cancelDirectCheckout, undefined, { orderId: "ord_1" })).rejects.toMatchObject({
      code: "unauthenticated",
    });
    await expect(call(fulfillDirectOrder, undefined, { orderId: "ord_1" })).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("rejects signed-in callers who do not own the profile", async () => {
    await expect(call(getDirectCheckoutQuote, stranger, { profileId: "p1", service: "monthly_horoscope" })).rejects.toMatchObject({
      code: "permission-denied",
    });
    await expect(call(createDirectCheckout, stranger, { profileId: "p1", service: "situation", question: "Will this work?" })).rejects.toMatchObject({
      code: "permission-denied",
    });
    await expect(call(listProfileHoroscopes, stranger, { profileId: "p1" })).rejects.toMatchObject({
      code: "permission-denied",
    });
  });
});

describe("full star redemption, surplus preservation & GA4 $0 funnel (REQ-003, REQ-005, DEC-004, DEC-007, DEC-008)", () => {
  it("completes a monthly horoscope with 8 stars, deducts 5, preserves 3, and records a $0 purchase deduplicated by orderId", async () => {
    h.fake.seed("wallets", "u1", { tokens: 8 });

    const quoteRes = await call(getDirectCheckoutQuote, owner, { profileId: "p1", service: "monthly_horoscope" });
    expect(quoteRes.quote).toMatchObject({
      basePriceCents: 499,
      fullStarCost: 5,
      appliedStars: 5,
      surplusStars: 3,
      payableCents: 0,
      paymentPath: "stars_only",
    });

    const checkout = await call(createDirectCheckout, owner, {
      profileId: "p1",
      service: "monthly_horoscope",
      language: "ru",
      confirmedPayableCents: 0,
      confirmedAppliedStars: 5,
      analytics: { consent: "granted", clientId: "1234567890.1234567890" },
    });
    expect(checkout).toMatchObject({ mode: "stars_only", payableCents: 0, appliedStars: 5, surplusStars: 3 });
    expect(h.stripeSessionsCreate).not.toHaveBeenCalled();
    expect(h.fake.all("wallets").get("u1")?.tokens).toBe(3);

    // Purchase analytics must NOT fire before the order completes successfully (REQ-005 AC #17).
    expect(h.fetchMock).not.toHaveBeenCalled();
    expect(h.fake.all("purchases").size).toBe(0);

    const fulfilled = await call(fulfillDirectOrder, owner, { orderId: checkout.orderId });
    expect(fulfilled.status).toBe("completed");
    expect(fulfilled.text).toBe("Forecast body covering the requested dates.");
    expect(fulfilled.periodStart).toMatch(/^\d{4}-\d{2}-01$/);
    expect(fulfilled.periodEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Now recorded ONCE with $0 USD revenue, no Stripe session, real client_id + user_id.
    expect(h.fake.all("purchases").size).toBe(1);
    expect(h.fake.all("purchases").get(checkout.orderId)).toMatchObject({
      amountTotal: 0,
      paymentPath: "stars_only",
      appliedStars: 5,
      stripeSessionId: null,
      livemode: true,
    });
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
    const gaBody = JSON.parse(h.fetchMock.mock.calls[0][1].body);
    expect(gaBody.client_id).toBe("1234567890.1234567890");
    expect(gaBody.user_id).toBe("u1");
    expect(gaBody.events[0]).toMatchObject({
      name: "purchase",
      params: {
        transaction_id: checkout.orderId,
        value: 0,
        currency: "USD",
        payment_path: "stars_only",
        stars_applied: 5,
      },
    });

    // Reprocessing the same completed order does not rerun AI, spend stars, or inflate conversion.
    const replay = await call(fulfillDirectOrder, owner, { orderId: checkout.orderId });
    expect(replay.status).toBe("completed");
    expect(replay.text).toBe(fulfilled.text);
    const storedOrder = h.fake.all("directOrders").get(checkout.orderId) as unknown as DirectOrderDoc;
    await recordCompletedStarOrderPurchase(storedOrder);
    expect(h.runTask).toHaveBeenCalledTimes(1);
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
    expect(h.fake.all("purchases").size).toBe(1);
    expect(h.fake.all("wallets").get("u1")?.tokens).toBe(3);

    // Attempting a second purchase for the same profile and calendar month skips checkout & charges nothing (DEC-007).
    const second = await call(createDirectCheckout, owner, {
      profileId: "p1",
      service: "monthly_horoscope",
      language: "ru",
    });
    expect(second.mode).toBe("existing_horoscope");
    expect(second.horoscope.text).toBe(fulfilled.text);
    expect(h.fake.all("wallets").get("u1")?.tokens).toBe(3);
  });

  it("deduplicates anonymous star-only purchases with a deterministic pseudo client_id without a Stripe session", async () => {
    h.fake.seed("wallets", "u1", { tokens: 1 });
    const checkout = await call(createDirectCheckout, owner, {
      profileId: "p1",
      service: "situation",
      question: "How will my job search go?",
      language: "en",
      confirmedPayableCents: 0,
      confirmedAppliedStars: 1,
      analytics: { consent: "denied" },
    });
    await call(fulfillDirectOrder, owner, { orderId: checkout.orderId });
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
    const gaBody = JSON.parse(h.fetchMock.mock.calls[0][1].body);
    expect(gaBody.user_id).toBeUndefined();
    expect(gaBody.client_id).toMatch(/^\d{10}\.\d{10}$/);
    expect(gaBody.client_id).not.toBe(checkout.orderId);
    expect(gaBody.events[0].params.transaction_id).toBe(checkout.orderId);
    expect(gaBody.events[0].params.value).toBe(0);
  });
});

describe("partial star redemption, cancellation, quote change guard & webhook idempotency (REQ-005)", () => {
  it("charges $2.99 on Stripe for monthly horoscope with 2 stars, leaves stars available on cancel, and deducts once on payment", async () => {
    h.fake.seed("wallets", "u1", { tokens: 2 });

    // Start checkout: 2 stars applied -> $2.99 USD on Stripe.
    const checkout1 = await call(createDirectCheckout, owner, {
      profileId: "p1",
      service: "monthly_horoscope",
      language: "ru",
      confirmedPayableCents: 299,
      confirmedAppliedStars: 2,
    });
    expect(checkout1).toMatchObject({ mode: "stripe", payableCents: 299, appliedStars: 2 });
    expect(h.stripeSessionsCreate).toHaveBeenCalledTimes(1);
    expect(h.stripeSessionsCreate.mock.calls[0][0].line_items[0].price_data.unit_amount).toBe(299);
    // Stars are NOT deducted while awaiting payment.
    expect(h.fake.all("wallets").get("u1")?.tokens).toBe(2);

    // Concurrent attempt while checkout is open reuses existing checkout URL instead of creating a second Stripe session.
    const concurrent = await call(createDirectCheckout, owner, {
      profileId: "p1",
      service: "monthly_horoscope",
      language: "ru",
      confirmedPayableCents: 299,
      confirmedAppliedStars: 2,
    });
    expect(concurrent).toMatchObject({ mode: "stripe", orderId: checkout1.orderId, url: checkout1.url });
    expect(h.stripeSessionsCreate).toHaveBeenCalledTimes(1);

    // User cancels checkout: stars stay completely available (REQ-005 AC #13).
    const canceled = await call(cancelDirectCheckout, owner, { orderId: checkout1.orderId });
    expect(canceled).toEqual({ canceled: true, status: "canceled" });
    expect(h.fake.all("wallets").get("u1")?.tokens).toBe(2);

    // User starts again and pays on Stripe.
    const checkout2 = await call(createDirectCheckout, owner, {
      profileId: "p1",
      service: "monthly_horoscope",
      language: "ru",
      confirmedPayableCents: 299,
      confirmedAppliedStars: 2,
    });
    expect(checkout2.mode).toBe("stripe");
    expect(checkout2.orderId).not.toBe(checkout1.orderId);

    // Webhook confirms payment -> deducts 2 stars once, records $2.99 purchase & GA4 event.
    await confirmPaidDirectOrder(checkout2.orderId, {
      stripeSessionId: "cs_live_2",
      stripePaymentIntent: "pi_2",
      amountTotalCents: 299,
      currency: "usd",
      customerEmail: "anna@example.com",
      livemode: true,
    });
    expect(h.fake.all("wallets").get("u1")?.tokens).toBe(0);
    expect(h.fake.all("purchases").get(checkout2.orderId)).toMatchObject({
      amountTotal: 299,
      appliedStars: 2,
      paymentPath: "mixed",
      stripeSessionId: "cs_live_2",
    });
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
    const gaBody = JSON.parse(h.fetchMock.mock.calls[0][1].body);
    expect(gaBody.events[0].params).toMatchObject({
      transaction_id: checkout2.orderId,
      value: 2.99,
      currency: "USD",
      payment_path: "mixed",
      stars_applied: 2,
    });

    // Redelivered webhook does NOT deduct stars again or duplicate GA4 event.
    const dup = await confirmPaidDirectOrder(checkout2.orderId, {
      stripeSessionId: "cs_live_2",
      stripePaymentIntent: "pi_2",
      amountTotalCents: 299,
      currency: "usd",
      customerEmail: "anna@example.com",
      livemode: true,
    });
    expect(dup.newlyConfirmed).toBe(false);
    expect(h.fake.all("wallets").get("u1")?.tokens).toBe(0);
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
  });

  it("charges $2.00 on Stripe for relationship forecast with exactly 1 star (REQ-005 AC #7, DEC-010)", async () => {
    h.fake.seed("wallets", "u1", { tokens: 1 });
    const checkout = await call(createDirectCheckout, owner, {
      profileId: "p1",
      service: "relationship",
      partner,
      language: "ru",
      confirmedPayableCents: 200,
      confirmedAppliedStars: 1,
    });
    expect(checkout).toMatchObject({ mode: "stripe", payableCents: 200, appliedStars: 1 });
    expect(h.stripeSessionsCreate.mock.calls[0][0].line_items[0].price_data.unit_amount).toBe(200);
  });

  it("rejects checkout with QUOTE_CHANGED if live star balance changed after confirmation preview", async () => {
    h.fake.seed("wallets", "u1", { tokens: 1 });
    await expect(
      call(createDirectCheckout, owner, {
        profileId: "p1",
        service: "monthly_horoscope",
        confirmedPayableCents: 299, // stale quote from when balance was 2★
        confirmedAppliedStars: 2,
      }),
    ).rejects.toMatchObject({ code: "aborted", message: "QUOTE_CHANGED" });
    expect(h.stripeSessionsCreate).not.toHaveBeenCalled();
  });

  it("deduplicates retries of createDirectCheckout via idempotencyKey without double star deduction", async () => {
    h.fake.seed("wallets", "u1", { tokens: 3 });
    const first = await call(createDirectCheckout, owner, {
      profileId: "p1",
      service: "situation",
      question: "Should I move?",
      confirmedPayableCents: 0,
      confirmedAppliedStars: 1,
      idempotencyKey: "retry-key-1",
    });
    const retry = await call(createDirectCheckout, owner, {
      profileId: "p1",
      service: "situation",
      question: "Should I move?",
      confirmedPayableCents: 0,
      confirmedAppliedStars: 1,
      idempotencyKey: "retry-key-1",
    });
    expect(first.mode).toBe("stars_only");
    expect(retry).toMatchObject({ mode: "existing_order", orderId: first.orderId });
    expect(h.fake.all("wallets").get("u1")?.tokens).toBe(2); // deducted ONCE, not twice
  });
});

describe("failed generation recovery and post-period access (REQ-003 AC #6-#8, REQ-005 AC #11, #12, #15)", () => {
  it("prevents a second purchase while generation failed and lets the user retry under the same order without extra charge or stars", async () => {
    h.fake.seed("wallets", "u1", { tokens: 5 });
    const checkout = await call(createDirectCheckout, owner, {
      profileId: "p1",
      service: "monthly_horoscope",
      language: "ru",
      confirmedPayableCents: 0,
      confirmedAppliedStars: 5,
    });
    expect(h.fake.all("wallets").get("u1")?.tokens).toBe(0);

    // First AI attempt fails.
    h.runTask.mockRejectedValueOnce(new Error("Upstream timeout"));
    await expect(call(fulfillDirectOrder, owner, { orderId: checkout.orderId })).rejects.toMatchObject({
      code: "internal",
    });

    // No $0 purchase analytics fired on failed generation.
    expect(h.fetchMock).not.toHaveBeenCalled();
    expect(h.fake.all("purchases").size).toBe(0);

    // Second purchase attempt for the same month is BLOCKED and points to the existing order.
    const secondAttempt = await call(createDirectCheckout, owner, {
      profileId: "p1",
      service: "monthly_horoscope",
      language: "ru",
    });
    expect(secondAttempt).toMatchObject({
      mode: "existing_order",
      orderId: checkout.orderId,
      fulfillmentStatus: "failed",
    });

    // Recoverable order is listed for the user.
    const listed = await call(listProfileHoroscopes, owner, { profileId: "p1" });
    expect(listed.recoverableOrders).toHaveLength(1);
    expect(listed.recoverableOrders[0].orderId).toBe(checkout.orderId);

    // Retry succeeds under the original order without charging money or deducting stars again.
    const recovered = await call(fulfillDirectOrder, owner, { orderId: checkout.orderId });
    expect(recovered.status).toBe("completed");
    expect(h.fake.all("wallets").get("u1")?.tokens).toBe(0);
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
    expect(h.fake.all("purchases").size).toBe(1);

    // Past-period access: next month, the previous month's horoscope is still returned for reopening without checkout.
    const futureDate = new Date("2027-03-15T12:00:00Z");
    const afterPeriod = await listProfileHoroscopesAndOrders("p1", "u1", futureDate);
    expect(afterPeriod.currentMonth.periodKey).toBe("2027-03");
    const savedPast = afterPeriod.horoscopes.find((x) => x.orderId === checkout.orderId);
    expect(savedPast).toBeDefined();
    expect(savedPast?.status).toBe("completed");
    expect(savedPast?.text).toBe("Forecast body covering the requested dates.");
  });
});

describe("unified purchase conversion and actual USD revenue reporting (DEC-008, REQ-005 AC #19-#20)", () => {
  it("counts USD-only, mixed, and $0 star-only completed orders in one funnel and calculates revenue from actual USD charged", () => {
    const now = new Date("2026-11-19T12:00:00Z");
    const purchases: PurchaseRow[] = [
      { id: "ord_usd", amountTotal: 499, currency: "usd", createdAt: now, livemode: true, ownerUid: "u1", profileId: "p1" },
      { id: "ord_mixed", amountTotal: 299, currency: "usd", createdAt: now, livemode: true, ownerUid: "u2", profileId: "p2" },
      { id: "ord_stars", amountTotal: 0, currency: "usd", createdAt: now, livemode: true, ownerUid: "u3", profileId: "p3" },
    ];
    const stats = computeBusinessStats({
      period: "30d",
      grouping: "day",
      now,
      purchases,
      profiles: new Map(),
      subscriptionStatuses: [],
      newProfiles: 3,
      spends: [],
      firstSpendAt: null,
    });
    expect(stats.totals.purchases).toBe(3);
    expect(stats.currencies).toHaveLength(1);
    expect(stats.currencies[0]).toMatchObject({
      currency: "USD",
      purchases: 3,
      revenueCents: 798, // $4.99 + $2.99 + $0.00 (actual USD charged)
    });
  });
});
