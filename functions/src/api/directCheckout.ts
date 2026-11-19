import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import Stripe from "stripe";
import * as profileService from "../services/profile";
import { ownerCtx, ownsProfile, requireAccount } from "../services/owner";
import { getWalletBalance } from "../services/wallet";
import { AI_SECRETS } from "../services/ai/keys";
import { normalizeLanguage } from "../services/prompts";
import { analyticsMetadata, parseClientAnalytics, readAnalyticsMetadata } from "../services/ga4";
import {
  calculateDirectCheckoutQuote,
  DIRECT_SERVICES,
  formatCalendarPeriodLabel,
  formatDateRangeLabel,
  getDirectService,
  periodForService,
  todayUtcIso,
  type DirectServiceId,
} from "../services/directServices";
import {
  attachStripeSessionToOrder,
  cancelAwaitingDirectOrder,
  confirmPaidDirectOrder,
  fulfillDirectOrder as fulfillDirectOrderService,
  listProfileHoroscopesAndOrders,
  startDirectOrder,
  type DirectOrderInput,
} from "../services/directOrders";
import { parsePartnerInput, parseSituationQuestion } from "../services/forecastGeneration";

function stripeProductName(
  service: DirectServiceId,
  periodStart: string,
  periodEnd: string,
  language: "en" | "ru",
): string {
  if (service === "monthly_horoscope") {
    const label = formatCalendarPeriodLabel("month", periodStart, language);
    return language === "ru" ? `Гороскоп на месяц · ${label}` : `Monthly Horoscope · ${label}`;
  }
  if (service === "yearly_horoscope") {
    const label = formatCalendarPeriodLabel("year", periodStart, language);
    return language === "ru" ? `Гороскоп на год · ${label}` : `Yearly Horoscope · ${label}`;
  }
  const range = formatDateRangeLabel(periodStart, periodEnd, language);
  if (service === "situation") {
    return language === "ru" ? `Прогноз на ситуацию · ${range}` : `Situation Forecast · ${range}`;
  }
  return language === "ru" ? `Прогноз на отношения · ${range}` : `Relationship Forecast · ${range}`;
}

async function requireOwnedProfile(profileId: unknown, uid: string) {
  if (typeof profileId !== "string" || !profileId.trim()) {
    throw new HttpsError("invalid-argument", "profileId is required");
  }
  const profile = await profileService.getProfileById(profileId);
  if (!profile) {
    throw new HttpsError("not-found", "Profile not found");
  }
  if (!ownsProfile(profile, { uid, deviceId: null })) {
    throw new HttpsError("permission-denied", "Not authorized");
  }
  return profile;
}

function optionalCoord(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

/**
 * List current calendar month/year dates, saved period horoscopes (current and
 * past periods), and any paid-but-unfulfilled direct orders for a profile.
 */
export const listProfileHoroscopes = onCall(async (request) => {
  const profileId = request.data?.profileId;
  if (typeof profileId !== "string" || !profileId.trim()) {
    throw new HttpsError("invalid-argument", "profileId is required");
  }
  const ctx = ownerCtx(request);
  const profile = await profileService.getProfileById(profileId);
  if (!profile) {
    throw new HttpsError("not-found", "Profile not found");
  }
  if (!ownsProfile(profile, ctx)) {
    throw new HttpsError("permission-denied", "Not authorized");
  }

  if (!ctx.uid) {
    const today = todayUtcIso();
    const m = periodForService("monthly_horoscope", today);
    const y = periodForService("yearly_horoscope", today);
    return {
      today,
      currentMonth: { periodKey: m.periodKey!, periodStart: m.periodStart, periodEnd: m.periodEnd },
      currentYear: { periodKey: y.periodKey!, periodStart: y.periodStart, periodEnd: y.periodEnd },
      horoscopes: [],
      recoverableOrders: [],
    };
  }

  return listProfileHoroscopesAndOrders(profileId, ctx.uid);
});

/**
 * Return the live server-computed checkout breakdown (base price, stars applied,
 * USD discount, final USD payable, covered dates, and any existing saved/pending
 * horoscope for the same period) before the user confirms checkout.
 */
export const getDirectCheckoutQuote = onCall(async (request) => {
  const uid = requireAccount(request);
  const serviceSpec = getDirectService(request.data?.service);
  if (!serviceSpec) {
    throw new HttpsError("invalid-argument", "Invalid direct service");
  }
  const profile = await requireOwnedProfile(request.data?.profileId, uid);
  const balance = await getWalletBalance(uid);
  const quote = calculateDirectCheckoutQuote(serviceSpec.id, balance);
  const period = periodForService(serviceSpec.id);

  let existingHoroscope = null;
  if (serviceSpec.kind === "period" && period.periodKey) {
    const overview = await listProfileHoroscopesAndOrders(profile.id, uid);
    existingHoroscope = overview.horoscopes.find((h) => h.periodKey === period.periodKey) ?? null;
  }

  return {
    quote,
    period,
    existingHoroscope,
  };
});

/**
 * Start a direct purchase for any of the four launch services (REQ-003, REQ-005):
 *  - monthly_horoscope ($4.99 / 5★)
 *  - yearly_horoscope ($19.99 / 20★)
 *  - situation ($1.99 / 1★)
 *  - relationship ($3.99 / 2★)
 *
 * Automatically applies available stars proportionally, checks that the live
 * amount matches the confirmed breakdown, enforces one purchase per (profile,
 * calendar period), and either completes immediately (stars-only, $0 USD) or
 * returns a Stripe Checkout URL for the remaining USD amount.
 */
export const createDirectCheckout = onCall(
  { secrets: ["STRIPE_SECRET_KEY", "GA_API_SECRET"] },
  async (request) => {
    const uid = requireAccount(request);
    const serviceSpec = getDirectService(request.data?.service);
    if (!serviceSpec) {
      throw new HttpsError("invalid-argument", "Invalid direct service");
    }
    const profile = await requireOwnedProfile(request.data?.profileId, uid);
    const language = normalizeLanguage(request.data?.language);
    const relocationLat = optionalCoord(request.data?.relocationLat, -90, 90);
    const relocationLng = optionalCoord(request.data?.relocationLng, -180, 180);

    const input: DirectOrderInput = {};
    if (serviceSpec.id === "situation") {
      input.question = parseSituationQuestion(request.data?.question);
    } else if (serviceSpec.id === "relationship") {
      input.partner = parsePartnerInput(request.data?.partner);
    }

    const confirmedPayableCents =
      typeof request.data?.confirmedPayableCents === "number"
        ? Math.round(request.data.confirmedPayableCents)
        : undefined;
    const confirmedAppliedStars =
      typeof request.data?.confirmedAppliedStars === "number"
        ? Math.floor(request.data.confirmedAppliedStars)
        : undefined;
    const idempotencyKey =
      typeof request.data?.idempotencyKey === "string" ? request.data.idempotencyKey : undefined;

    const clientAnalytics = parseClientAnalytics(request.data?.analytics);
    const storedAnalytics = readAnalyticsMetadata(analyticsMetadata(clientAnalytics, uid));
    const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";

    const outcome = await startDirectOrder({
      uid,
      profileId: profile.id,
      service: serviceSpec.id,
      language,
      relocationLat,
      relocationLng,
      input,
      analytics: storedAnalytics,
      confirmedPayableCents,
      confirmedAppliedStars,
      idempotencyKey,
      livemode: !isEmulator,
    });

    if (outcome.kind === "existing_horoscope") {
      return {
        mode: "existing_horoscope" as const,
        horoscope: outcome.horoscope,
      };
    }

    if (outcome.kind === "existing_order") {
      return {
        mode: "existing_order" as const,
        orderId: outcome.order.orderId,
        fulfillmentStatus: outcome.order.fulfillmentStatus,
      };
    }

    if (outcome.kind === "existing_checkout") {
      return {
        mode: "stripe" as const,
        orderId: outcome.order.orderId,
        url: outcome.order.stripeCheckoutUrl!,
        payableCents: outcome.order.payableCents,
        appliedStars: outcome.order.appliedStars,
      };
    }

    if (outcome.kind === "stars_only_paid") {
      return {
        mode: "stars_only" as const,
        orderId: outcome.order.orderId,
        payableCents: 0,
        appliedStars: outcome.quote.appliedStars,
        surplusStars: outcome.quote.surplusStars,
        periodStart: outcome.order.periodStart,
        periodEnd: outcome.order.periodEnd,
      };
    }

    // Needs USD payment via Stripe Checkout.
    const { order, quote } = outcome;
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const origin = request.rawRequest.headers.origin || "http://localhost:5173";
    const tab = DIRECT_SERVICES[order.service].targetTab;
    const successUrl = `${origin}/profile/${profile.id}?tab=${tab}&directOrder=${order.orderId}&checkout=success`;
    const cancelUrl = `${origin}/profile/${profile.id}?tab=${tab}&directOrder=${order.orderId}&checkout=cancel`;

    if (!stripeKey || stripeKey === "mock") {
      if (!isEmulator) {
        await cancelAwaitingDirectOrder(order.orderId, uid);
        logger.error("STRIPE_SECRET_KEY not configured — refusing direct checkout in production");
        throw new HttpsError("failed-precondition", "Payments are not available right now");
      }
      logger.warn("STRIPE_SECRET_KEY not set — mock direct payment (emulator only).");
      await confirmPaidDirectOrder(order.orderId, {
        stripeSessionId: `cs_mock_${order.orderId}`,
        stripePaymentIntent: null,
        amountTotalCents: order.payableCents,
        currency: "usd",
        customerEmail: null,
        livemode: false,
      });
      return {
        mode: "stripe" as const,
        orderId: order.orderId,
        url: successUrl,
        payableCents: order.payableCents,
        appliedStars: quote.appliedStars,
      };
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" as never });
    try {
      const expiresAt = Math.floor(Date.now() / 1000) + 30 * 60;
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        expires_at: expiresAt,
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: stripeProductName(order.service, order.periodStart, order.periodEnd, language),
              },
              unit_amount: order.payableCents,
            },
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          kind: "direct_service",
          orderId: order.orderId,
          profileId: profile.id,
          ownerUid: uid,
          walletKey: uid,
          service: order.service,
          appliedStars: String(order.appliedStars),
          ...analyticsMetadata(clientAnalytics, uid),
        },
      });

      await attachStripeSessionToOrder(order.orderId, session.id, session.url ?? "");
      return {
        mode: "stripe" as const,
        orderId: order.orderId,
        url: session.url!,
        payableCents: order.payableCents,
        appliedStars: quote.appliedStars,
      };
    } catch (error) {
      await cancelAwaitingDirectOrder(order.orderId, uid).catch(() => {});
      logger.error("createDirectCheckout Stripe failed", {
        orderId: order.orderId,
        error: (error as Error).message,
      });
      throw new HttpsError("internal", "Failed to create checkout session");
    }
  },
);

/** Cancel an unpaid direct checkout session; leaves stars completely untouched. */
export const cancelDirectCheckout = onCall(async (request) => {
  const uid = requireAccount(request);
  const orderId = request.data?.orderId;
  if (typeof orderId !== "string" || !orderId.trim()) {
    throw new HttpsError("invalid-argument", "orderId is required");
  }
  return cancelAwaitingDirectOrder(orderId.trim(), uid);
});

/**
 * Fulfill (or retry after generation failure, or reopen) a paid direct order
 * without creating a second charge or deducting stars again.
 */
export const fulfillDirectOrder = onCall(
  {
    timeoutSeconds: 180,
    secrets: [...AI_SECRETS, "STRIPE_SECRET_KEY", "GA_API_SECRET"],
  },
  async (request) => {
    const uid = requireAccount(request);
    const orderId = request.data?.orderId;
    if (typeof orderId !== "string" || !orderId.trim()) {
      throw new HttpsError("invalid-argument", "orderId is required");
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const verifyStripeSession =
      stripeKey && stripeKey !== "mock"
        ? async (sessionId: string) => {
            const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" as never });
            const session = await stripe.checkout.sessions.retrieve(sessionId);
            return {
              paid: session.payment_status === "paid" || session.payment_status === "no_payment_required",
              stripePaymentIntent:
                typeof session.payment_intent === "string" ? session.payment_intent : null,
              amountTotalCents: session.amount_total ?? null,
              currency: session.currency ?? "usd",
              customerEmail: session.customer_details?.email ?? null,
              livemode: session.livemode === true,
            };
          }
        : undefined;

    return fulfillDirectOrderService(orderId.trim(), uid, { verifyStripeSession });
  },
);
