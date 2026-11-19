import { createHash, randomUUID } from "node:crypto";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import {
  calculateDirectCheckoutQuote,
  DIRECT_SERVICES,
  periodForService,
  todayUtcIso,
  type DirectCheckoutQuote,
  type DirectPaymentPath,
  type DirectServiceId,
  type PeriodHoroscopeType,
} from "./directServices";
import { ensureWalletInTx, spendKnownBalanceInTx } from "./wallet";
import {
  generatePeriodHoroscope,
  generateRelationshipForecast,
  generateSituationForecast,
  type PartnerInput,
} from "./forecastGeneration";
import {
  directPurchaseEvent,
  sendGa4Once,
  type StoredAnalytics,
} from "./ga4";
import type { SupportedLanguage } from "./prompts";

/**
 * Direct checkout orders and saved period horoscopes (REQ-001..REQ-005,
 * DEC-001..DEC-010).
 *
 * Collections (all server-only; Firestore rules deny direct client access):
 *   - `directOrders/{orderId}`
 *   - `directOrderIdempotency/{sha(uid|key)}`
 *   - `periodHoroscopes/{profileId}/items/{periodKey}` ("YYYY-MM" or "YYYY")
 *   - `purchases/{orderId}` (unified audit/revenue ledger with Stripe & $0 star orders)
 */

const CHECKOUT_LOCK_TTL_MS = 30 * 60 * 1000;
const GENERATING_LEASE_TTL_MS = 3 * 60 * 1000;

export type DirectOrderPaymentStatus = "awaiting_payment" | "paid" | "canceled";
export type DirectOrderFulfillmentStatus = "not_started" | "pending" | "generating" | "completed" | "failed";
export type PeriodHoroscopeStatus = "checkout_pending" | "paid_pending" | "completed" | "failed";

export interface DirectOrderInput {
  question?: string;
  partner?: PartnerInput;
}

export interface DirectOrderResultMeta {
  model: string;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  partnerTimezone?: string;
  partnerName?: string;
  partnerBirthDate?: string;
  partnerBirthPlace?: string;
  question?: string;
  periodKey?: string;
  periodType?: PeriodHoroscopeType;
}

export interface DirectOrderDoc {
  orderId: string;
  ownerUid: string;
  walletKey: string;
  profileId: string;
  service: DirectServiceId;
  periodType: PeriodHoroscopeType | null;
  periodKey: string | null;
  periodStart: string;
  periodEnd: string;
  language: SupportedLanguage;
  relocationLat: number | null;
  relocationLng: number | null;
  input: DirectOrderInput;
  basePriceCents: number;
  fullStarCost: number;
  appliedStars: number;
  starDiscountCents: number;
  payableCents: number;
  paymentPath: DirectPaymentPath;
  paymentStatus: DirectOrderPaymentStatus;
  fulfillmentStatus: DirectOrderFulfillmentStatus;
  starsDeducted: number;
  stripeSessionId: string | null;
  stripeCheckoutUrl: string | null;
  stripePaymentIntent: string | null;
  livemode: boolean;
  analytics: StoredAnalytics;
  resultId: string | null;
  resultText: string | null;
  resultMeta: DirectOrderResultMeta | null;
  lastError: string | null;
  generatingStartedAt: string | null;
  createdAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
  updatedAt: string;
}

export interface PeriodHoroscopeDoc {
  profileId: string;
  ownerUid: string;
  periodType: PeriodHoroscopeType;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  language: SupportedLanguage;
  status: PeriodHoroscopeStatus;
  orderId: string;
  checkoutExpiresAt: string | null;
  text: string | null;
  model: string | null;
  generatedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

const db = () => getFirestore();
const ordersCol = () => db().collection("directOrders");
const orderRef = (orderId: string) => ordersCol().doc(orderId);
const idemRef = (uid: string, key: string) =>
  db()
    .collection("directOrderIdempotency")
    .doc(createHash("sha256").update(`${uid}|${key}`).digest("hex").slice(0, 40));
export const periodHoroscopeCol = (profileId: string) =>
  db().collection("periodHoroscopes").doc(profileId).collection("items");
const periodHoroscopeRef = (profileId: string, periodKey: string) =>
  periodHoroscopeCol(profileId).doc(periodKey);

function isExpired(iso: string | null | undefined, nowMs: number): boolean {
  if (!iso) return true;
  const parsed = Date.parse(iso);
  return !Number.isFinite(parsed) || parsed <= nowMs;
}

function sanitizeInput(input: DirectOrderInput): DirectOrderInput {
  const out: DirectOrderInput = {};
  if (input.question !== undefined) out.question = input.question;
  if (input.partner !== undefined) out.partner = input.partner;
  return out;
}

function sanitizeStoredAnalytics(a: StoredAnalytics): StoredAnalytics {
  return {
    consent: Boolean(a.consent),
    clientId: a.consent && a.clientId ? a.clientId : null,
    uid: a.consent && a.uid ? a.uid : null,
  };
}

/** Public view of a period horoscope returned to the owning client. */
export interface PublicPeriodHoroscope {
  periodType: PeriodHoroscopeType;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  language: SupportedLanguage;
  status: PeriodHoroscopeStatus;
  orderId: string;
  text: string | null;
  model: string | null;
  generatedAt: string | null;
  lastError: string | null;
}

export interface RecoverableDirectOrder {
  orderId: string;
  service: DirectServiceId;
  periodType: PeriodHoroscopeType | null;
  periodKey: string | null;
  periodStart: string;
  periodEnd: string;
  fulfillmentStatus: DirectOrderFulfillmentStatus;
  lastError: string | null;
  question?: string;
  partnerName?: string;
  createdAt: string;
}

function toPublicHoroscope(doc: PeriodHoroscopeDoc): PublicPeriodHoroscope {
  return {
    periodType: doc.periodType,
    periodKey: doc.periodKey,
    periodStart: doc.periodStart,
    periodEnd: doc.periodEnd,
    language: doc.language,
    status: doc.status,
    orderId: doc.orderId,
    text: doc.text ?? null,
    model: doc.model ?? null,
    generatedAt: doc.generatedAt ?? null,
    lastError: doc.lastError ?? null,
  };
}

/**
 * List all saved / pending / failed period horoscopes (current and past periods)
 * and any paid-but-not-yet-completed direct orders for a profile (DEC-007, REQ-003, REQ-005).
 */
export async function listProfileHoroscopesAndOrders(
  profileId: string,
  ownerUid: string,
  now: Date = new Date(),
): Promise<{
  today: string;
  currentMonth: { periodKey: string; periodStart: string; periodEnd: string };
  currentYear: { periodKey: string; periodStart: string; periodEnd: string };
  horoscopes: PublicPeriodHoroscope[];
  recoverableOrders: RecoverableDirectOrder[];
}> {
  const today = todayUtcIso(now);
  const currentMonth = periodForService("monthly_horoscope", today);
  const currentYear = periodForService("yearly_horoscope", today);
  const nowMs = now.getTime();

  const [horoscopesSnap, ordersSnap] = await Promise.all([
    periodHoroscopeCol(profileId).get(),
    ordersCol().where("profileId", "==", profileId).get(),
  ]);

  const horoscopes: PublicPeriodHoroscope[] = [];
  for (const d of horoscopesSnap.docs) {
    const h = d.data() as PeriodHoroscopeDoc;
    if (h.ownerUid && h.ownerUid !== ownerUid) continue;
    // Ignore expired checkout locks that were never paid.
    if (h.status === "checkout_pending" && isExpired(h.checkoutExpiresAt, nowMs)) continue;
    horoscopes.push(toPublicHoroscope(h));
  }
  horoscopes.sort((a, b) => b.periodStart.localeCompare(a.periodStart) || a.periodType.localeCompare(b.periodType));

  const recoverableOrders: RecoverableDirectOrder[] = [];
  for (const d of ordersSnap.docs) {
    const o = d.data() as DirectOrderDoc;
    if (o.ownerUid !== ownerUid) continue;
    if (o.paymentStatus === "paid" && o.fulfillmentStatus !== "completed") {
      recoverableOrders.push({
        orderId: o.orderId,
        service: o.service,
        periodType: o.periodType ?? null,
        periodKey: o.periodKey ?? null,
        periodStart: o.periodStart,
        periodEnd: o.periodEnd,
        fulfillmentStatus: o.fulfillmentStatus,
        lastError: o.lastError ?? null,
        ...(o.input?.question ? { question: o.input.question } : {}),
        ...(o.input?.partner?.name ? { partnerName: o.input.partner.name } : {}),
        createdAt: o.createdAt,
      });
    }
  }
  recoverableOrders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    today,
    currentMonth: {
      periodKey: currentMonth.periodKey!,
      periodStart: currentMonth.periodStart,
      periodEnd: currentMonth.periodEnd,
    },
    currentYear: {
      periodKey: currentYear.periodKey!,
      periodStart: currentYear.periodStart,
      periodEnd: currentYear.periodEnd,
    },
    horoscopes,
    recoverableOrders,
  };
}

export type StartDirectOrderOutcome =
  | { kind: "existing_horoscope"; horoscope: PublicPeriodHoroscope }
  | { kind: "existing_order"; order: DirectOrderDoc }
  | { kind: "existing_checkout"; order: DirectOrderDoc }
  | { kind: "stars_only_paid"; order: DirectOrderDoc; quote: DirectCheckoutQuote }
  | { kind: "needs_stripe"; order: DirectOrderDoc; quote: DirectCheckoutQuote };

/**
 * Start a direct-service purchase inside one Firestore transaction:
 *  - Enforces one purchase per (profile, calendar period) including concurrent attempts (DEC-007).
 *  - Reuses idempotent retry keys without creating duplicate orders or deductions (REQ-005).
 *  - Checks that live star balance matches confirmed payableCents/appliedStars so the charged
 *    amount always matches what the user confirmed (REQ-005 AC #3).
 *  - Deducts stars immediately ONLY for stars-only ($0 USD) orders; for USD/mixed orders,
 *    stars stay untouched in the wallet until payment succeeds so canceled checkout leaves
 *    stars available (REQ-005 AC #13).
 */
export async function startDirectOrder(params: {
  uid: string;
  profileId: string;
  service: DirectServiceId;
  language: SupportedLanguage;
  relocationLat: number | null;
  relocationLng: number | null;
  input: DirectOrderInput;
  analytics: StoredAnalytics;
  confirmedPayableCents?: number;
  confirmedAppliedStars?: number;
  idempotencyKey?: string;
  livemode: boolean;
  now?: Date;
}): Promise<StartDirectOrderOutcome> {
  const spec = DIRECT_SERVICES[params.service];
  const now = params.now ?? new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  const today = todayUtcIso(now);
  const period = periodForService(params.service, today);
  const walletKey = params.uid;
  const cleanIdem =
    typeof params.idempotencyKey === "string" && params.idempotencyKey.trim().length > 0
      ? params.idempotencyKey.trim().slice(0, 120)
      : null;

  return db().runTransaction(async (tx) => {
    // ---- ALL READS FIRST (Firestore requires reads before writes) ----
    const idemDocRef = cleanIdem ? idemRef(params.uid, cleanIdem) : null;
    const idemSnap = idemDocRef ? await tx.get(idemDocRef) : null;
    let idemExistingOrder: DirectOrderDoc | null = null;
    if (idemSnap?.exists) {
      const existingId = String(idemSnap.data()?.orderId ?? "");
      if (existingId) {
        const ordSnap = await tx.get(orderRef(existingId));
        if (ordSnap.exists) idemExistingOrder = ordSnap.data() as DirectOrderDoc;
      }
    }

    const periodDocRef =
      spec.kind === "period" && period.periodKey ? periodHoroscopeRef(params.profileId, period.periodKey) : null;
    const periodSnap = periodDocRef ? await tx.get(periodDocRef) : null;
    let periodExistingOrder: DirectOrderDoc | null = null;
    if (periodSnap?.exists) {
      const h = periodSnap.data() as PeriodHoroscopeDoc;
      if (h.orderId) {
        const ordSnap = await tx.get(orderRef(h.orderId));
        if (ordSnap.exists) periodExistingOrder = ordSnap.data() as DirectOrderDoc;
      }
    }

    // 1. Idempotency replay: return the prior order unless it was explicitly canceled.
    if (idemExistingOrder && idemExistingOrder.paymentStatus !== "canceled") {
      if (idemExistingOrder.paymentStatus === "paid") {
        return { kind: "existing_order", order: idemExistingOrder };
      }
      if (idemExistingOrder.stripeCheckoutUrl) {
        return { kind: "existing_checkout", order: idemExistingOrder };
      }
    }

    // 2. Period-horoscope mutual exclusion (DEC-007, REQ-003 AC #7, REQ-005 AC #12).
    if (periodSnap?.exists) {
      const existing = periodSnap.data() as PeriodHoroscopeDoc;
      if (existing.status === "completed") {
        return { kind: "existing_horoscope", horoscope: toPublicHoroscope(existing) };
      }
      if (existing.status === "paid_pending" || existing.status === "failed") {
        if (periodExistingOrder) {
          return { kind: "existing_order", order: periodExistingOrder };
        }
        throw new HttpsError("already-exists", "Horoscope for this period is already purchased");
      }
      if (existing.status === "checkout_pending" && !isExpired(existing.checkoutExpiresAt, nowMs)) {
        if (
          periodExistingOrder &&
          periodExistingOrder.paymentStatus === "awaiting_payment" &&
          periodExistingOrder.stripeCheckoutUrl
        ) {
          return { kind: "existing_checkout", order: periodExistingOrder };
        }
        // Another request is mid-flight creating the Stripe session; reject concurrent duplicate.
        if (periodExistingOrder && periodExistingOrder.paymentStatus === "awaiting_payment") {
          throw new HttpsError("aborted", "CHECKOUT_IN_PROGRESS");
        }
      }
    }

    // 3. Read live wallet balance inside the transaction (may seed legacy tokens).
    const liveBalance = await ensureWalletInTx(tx, walletKey);
    const quote = calculateDirectCheckoutQuote(params.service, liveBalance);

    // Ensure the charged amount matches what the user confirmed before proceeding (REQ-005 AC #3).
    if (
      (typeof params.confirmedPayableCents === "number" && params.confirmedPayableCents !== quote.payableCents) ||
      (typeof params.confirmedAppliedStars === "number" && params.confirmedAppliedStars !== quote.appliedStars)
    ) {
      throw new HttpsError("aborted", "QUOTE_CHANGED", { quote });
    }

    const orderId = `ord_${randomUUID().replace(/-/g, "")}`;
    const isStarsOnly = quote.payableCents === 0;

    if (isStarsOnly) {
      spendKnownBalanceInTx(tx, walletKey, liveBalance, quote.appliedStars, spec.spendFeature);
    }

    const order: DirectOrderDoc = {
      orderId,
      ownerUid: params.uid,
      walletKey,
      profileId: params.profileId,
      service: params.service,
      periodType: period.periodType,
      periodKey: period.periodKey,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      language: params.language,
      relocationLat: params.relocationLat,
      relocationLng: params.relocationLng,
      input: sanitizeInput(params.input),
      basePriceCents: quote.basePriceCents,
      fullStarCost: quote.fullStarCost,
      appliedStars: quote.appliedStars,
      starDiscountCents: quote.starDiscountCents,
      payableCents: quote.payableCents,
      paymentPath: quote.paymentPath,
      paymentStatus: isStarsOnly ? "paid" : "awaiting_payment",
      fulfillmentStatus: isStarsOnly ? "pending" : "not_started",
      starsDeducted: isStarsOnly ? quote.appliedStars : 0,
      stripeSessionId: null,
      stripeCheckoutUrl: null,
      stripePaymentIntent: null,
      livemode: params.livemode,
      analytics: sanitizeStoredAnalytics(params.analytics),
      resultId: null,
      resultText: null,
      resultMeta: null,
      lastError: null,
      generatingStartedAt: null,
      createdAt: nowIso,
      paidAt: isStarsOnly ? nowIso : null,
      fulfilledAt: null,
      updatedAt: nowIso,
    };

    tx.set(orderRef(orderId), order);

    if (idemDocRef) {
      tx.set(idemDocRef, { orderId, ownerUid: params.uid, createdAt: nowIso });
    }

    if (periodDocRef && period.periodType && period.periodKey) {
      const periodDoc: PeriodHoroscopeDoc = {
        profileId: params.profileId,
        ownerUid: params.uid,
        periodType: period.periodType,
        periodKey: period.periodKey,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        language: params.language,
        status: isStarsOnly ? "paid_pending" : "checkout_pending",
        orderId,
        checkoutExpiresAt: isStarsOnly ? null : new Date(nowMs + CHECKOUT_LOCK_TTL_MS).toISOString(),
        text: null,
        model: null,
        generatedAt: null,
        lastError: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      tx.set(periodDocRef, periodDoc);
    }

    return isStarsOnly
      ? { kind: "stars_only_paid", order, quote }
      : { kind: "needs_stripe", order, quote };
  });
}

/** Attach the created Stripe session URL & ID to an awaiting order. */
export async function attachStripeSessionToOrder(
  orderId: string,
  stripeSessionId: string,
  stripeCheckoutUrl: string,
): Promise<void> {
  await orderRef(orderId).set(
    {
      stripeSessionId,
      stripeCheckoutUrl,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

/**
 * Cancel an unpaid checkout order and release any period-horoscope lock.
 * Because stars are never deducted while awaiting payment, canceling leaves
 * 100% of the user's star balance available (REQ-005 AC #13).
 */
export async function cancelAwaitingDirectOrder(
  orderId: string,
  expectedOwnerUid: string | null,
): Promise<{ canceled: boolean; status: DirectOrderPaymentStatus | "not_found" }> {
  const nowIso = new Date().toISOString();
  return db().runTransaction(async (tx) => {
    const oRef = orderRef(orderId);
    const oSnap = await tx.get(oRef);
    if (!oSnap.exists) return { canceled: false, status: "not_found" as const };
    const order = oSnap.data() as DirectOrderDoc;
    if (expectedOwnerUid && order.ownerUid !== expectedOwnerUid) {
      throw new HttpsError("permission-denied", "Not authorized");
    }
    if (order.paymentStatus !== "awaiting_payment") {
      return { canceled: false, status: order.paymentStatus };
    }

    const pRef = order.periodKey ? periodHoroscopeRef(order.profileId, order.periodKey) : null;
    const pSnap = pRef ? await tx.get(pRef) : null;

    tx.set(oRef, { paymentStatus: "canceled", updatedAt: nowIso }, { merge: true });
    if (pRef && pSnap?.exists) {
      const h = pSnap.data() as PeriodHoroscopeDoc;
      if (h.orderId === orderId && h.status === "checkout_pending") {
        tx.delete(pRef);
      }
    }
    return { canceled: true, status: "canceled" as const };
  });
}

/**
 * Idempotently record a paid Stripe checkout for a direct-service order:
 *  - Deducts any applied partial stars ONCE inside the same transaction.
 *  - Writes `purchases/{orderId}` with the actual USD charged.
 *  - Reports GA4 `purchase` event (deduplicated by `orderId`) when live.
 *
 * Safe to call from BOTH `stripeWebhook` and `fulfillDirectOrder` (webhook+client race).
 */
export async function confirmPaidDirectOrder(
  orderId: string,
  payment: {
    stripeSessionId: string;
    stripePaymentIntent: string | null;
    amountTotalCents: number | null;
    currency: string | null;
    customerEmail: string | null;
    livemode: boolean;
  },
  deps: { sendGa4?: Parameters<typeof sendGa4Once>[3] } = {},
): Promise<{ newlyConfirmed: boolean; order: DirectOrderDoc }> {
  const nowIso = new Date().toISOString();
  const txResult = await db().runTransaction(async (tx) => {
    const oRef = orderRef(orderId);
    const oSnap = await tx.get(oRef);
    if (!oSnap.exists) {
      throw new HttpsError("not-found", "Direct order not found");
    }
    const order = oSnap.data() as DirectOrderDoc;
    if (order.paymentStatus === "paid") {
      return { newlyConfirmed: false, order };
    }

    const pRef = order.periodKey ? periodHoroscopeRef(order.profileId, order.periodKey) : null;
    const pSnap = pRef ? await tx.get(pRef) : null;
    const purchaseDocRef = db().collection("purchases").doc(orderId);
    const purchaseSnap = await tx.get(purchaseDocRef);

    let starsDeducted = order.starsDeducted || 0;
    if (order.appliedStars > 0 && starsDeducted === 0) {
      const balance = await ensureWalletInTx(tx, order.walletKey);
      const toDeduct = Math.min(balance, order.appliedStars);
      if (toDeduct < order.appliedStars) {
        logger.warn("Direct order wallet balance dropped before payment confirmation", {
          orderId,
          expected: order.appliedStars,
          deducted: toDeduct,
        });
      }
      if (toDeduct > 0) {
        spendKnownBalanceInTx(tx, order.walletKey, balance, toDeduct, DIRECT_SERVICES[order.service].spendFeature);
      }
      starsDeducted = toDeduct;
    }

    const actualCents =
      typeof payment.amountTotalCents === "number" ? payment.amountTotalCents : order.payableCents;
    const updated: DirectOrderDoc = {
      ...order,
      paymentStatus: "paid",
      fulfillmentStatus: order.fulfillmentStatus === "not_started" ? "pending" : order.fulfillmentStatus,
      starsDeducted,
      stripeSessionId: payment.stripeSessionId,
      stripePaymentIntent: payment.stripePaymentIntent,
      livemode: payment.livemode,
      paidAt: order.paidAt ?? nowIso,
      updatedAt: nowIso,
    };

    tx.set(oRef, updated);

    if (pRef && order.periodType && order.periodKey) {
      const prev = pSnap?.exists ? (pSnap.data() as PeriodHoroscopeDoc) : null;
      if (!prev || prev.status !== "completed") {
        tx.set(
          pRef,
          {
            profileId: order.profileId,
            ownerUid: order.ownerUid,
            periodType: order.periodType,
            periodKey: order.periodKey,
            periodStart: order.periodStart,
            periodEnd: order.periodEnd,
            language: order.language,
            status: "paid_pending",
            orderId,
            checkoutExpiresAt: null,
            text: null,
            model: null,
            generatedAt: null,
            lastError: null,
            createdAt: prev?.createdAt ?? nowIso,
            updatedAt: nowIso,
          } satisfies PeriodHoroscopeDoc,
        );
      }
    }

    if (!purchaseSnap.exists) {
      tx.set(purchaseDocRef, {
        profileId: order.profileId,
        ownerDeviceId: null,
        tier: "direct_service",
        service: order.service,
        orderId,
        paymentPath: order.paymentPath,
        tokens: 0,
        appliedStars: starsDeducted,
        amountTotal: actualCents,
        currency: (payment.currency ?? "usd").toLowerCase(),
        paymentStatus: "paid",
        livemode: payment.livemode,
        packId: order.service,
        walletKey: order.walletKey,
        ownerUid: order.ownerUid,
        stripeSessionId: payment.stripeSessionId,
        stripePaymentIntent: payment.stripePaymentIntent,
        customerEmail: payment.customerEmail,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return { newlyConfirmed: true, order: updated };
  });

  if (payment.livemode) {
    const actualCents =
      typeof payment.amountTotalCents === "number" ? payment.amountTotalCents : txResult.order.payableCents;
    await sendGa4Once(
      directPurchaseEvent({
        orderId,
        service: txResult.order.service,
        amountCents: actualCents,
        currency: payment.currency ?? "usd",
        paymentPath: txResult.order.paymentPath,
        appliedStars: txResult.order.starsDeducted,
      }),
      txResult.order.analytics,
      payment.stripeSessionId || orderId,
      deps.sendGa4,
    );
  }

  return txResult;
}

/**
 * Record a completed fully star-funded order in `purchases/{orderId}` (USD 0 revenue)
 * and in GA4 under the same `purchase` funnel, deduplicated strictly by `orderId`
 * without relying on any Stripe session (DEC-008, REQ-005 AC #17-#20).
 */
export async function recordCompletedStarOrderPurchase(
  order: DirectOrderDoc,
  deps: { sendGa4?: Parameters<typeof sendGa4Once>[3] } = {},
): Promise<{ recorded: boolean }> {
  const purchaseDocRef = db().collection("purchases").doc(order.orderId);
  const recorded = await db().runTransaction(async (tx) => {
    const snap = await tx.get(purchaseDocRef);
    if (snap.exists) return false;
    tx.set(purchaseDocRef, {
      profileId: order.profileId,
      ownerDeviceId: null,
      tier: "direct_service",
      service: order.service,
      orderId: order.orderId,
      paymentPath: "stars_only",
      tokens: 0,
      appliedStars: order.starsDeducted,
      amountTotal: 0,
      currency: "usd",
      paymentStatus: "paid",
      livemode: order.livemode,
      packId: order.service,
      walletKey: order.walletKey,
      ownerUid: order.ownerUid,
      stripeSessionId: null,
      stripePaymentIntent: null,
      customerEmail: null,
      createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  });

  if (order.livemode) {
    await sendGa4Once(
      directPurchaseEvent({
        orderId: order.orderId,
        service: order.service,
        amountCents: 0,
        currency: "usd",
        paymentPath: "stars_only",
        appliedStars: order.starsDeducted,
      }),
      order.analytics,
      order.orderId,
      deps.sendGa4,
    );
  }

  return { recorded };
}

export interface FulfillDirectOrderResponse {
  status: "completed" | "pending" | "awaiting_payment";
  orderId: string;
  service: DirectServiceId;
  periodType: PeriodHoroscopeType | null;
  periodKey: string | null;
  periodStart: string;
  periodEnd: string;
  text: string | null;
  resultId: string | null;
  meta: DirectOrderResultMeta | null;
}

export interface FulfillDeps {
  verifyStripeSession?: (sessionId: string) => Promise<{
    paid: boolean;
    stripePaymentIntent: string | null;
    amountTotalCents: number | null;
    currency: string | null;
    customerEmail: string | null;
    livemode: boolean;
  } | null>;
  sendGa4?: Parameters<typeof sendGa4Once>[3];
  now?: () => Date;
}

/**
 * Execute (or recover after failure, or return already-completed result of)
 * a paid direct-service order without charging money or deducting stars again
 * (REQ-003 AC #8, REQ-005 AC #14-#18).
 */
export async function fulfillDirectOrder(
  orderId: string,
  ownerUid: string,
  deps: FulfillDeps = {},
): Promise<FulfillDirectOrderResponse> {
  const nowFn = deps.now ?? (() => new Date());
  const snap = await orderRef(orderId).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Order not found");
  }
  let order = snap.data() as DirectOrderDoc;
  if (order.ownerUid !== ownerUid) {
    throw new HttpsError("permission-denied", "Not authorized");
  }

  if (order.paymentStatus === "canceled") {
    throw new HttpsError("failed-precondition", "Order was canceled");
  }

  // If the client returned from Stripe before the webhook landed, verify the
  // session directly and confirm payment idempotently.
  if (order.paymentStatus === "awaiting_payment") {
    if (order.stripeSessionId && deps.verifyStripeSession) {
      const verified = await deps.verifyStripeSession(order.stripeSessionId);
      if (verified?.paid) {
        const confirmed = await confirmPaidDirectOrder(
          orderId,
          {
            stripeSessionId: order.stripeSessionId,
            stripePaymentIntent: verified.stripePaymentIntent,
            amountTotalCents: verified.amountTotalCents,
            currency: verified.currency,
            customerEmail: verified.customerEmail,
            livemode: verified.livemode,
          },
          { sendGa4: deps.sendGa4 },
        );
        order = confirmed.order;
      }
    }
    if (order.paymentStatus === "awaiting_payment") {
      return {
        status: "awaiting_payment",
        orderId: order.orderId,
        service: order.service,
        periodType: order.periodType,
        periodKey: order.periodKey,
        periodStart: order.periodStart,
        periodEnd: order.periodEnd,
        text: null,
        resultId: null,
        meta: null,
      };
    }
  }

  // Already completed: return saved result directly (0 AI calls, 0 charges, 0 analytics).
  if (order.fulfillmentStatus === "completed") {
    return {
      status: "completed",
      orderId: order.orderId,
      service: order.service,
      periodType: order.periodType,
      periodKey: order.periodKey,
      periodStart: order.periodStart,
      periodEnd: order.periodEnd,
      text: order.resultText,
      resultId: order.resultId,
      meta: order.resultMeta,
    };
  }

  // Acquire generation lease transactionally so concurrent retries don't double-run AI.
  const lease = await db().runTransaction(async (tx) => {
    const oSnap = await tx.get(orderRef(orderId));
    if (!oSnap.exists) throw new HttpsError("not-found", "Order not found");
    const current = oSnap.data() as DirectOrderDoc;
    if (current.fulfillmentStatus === "completed") {
      return { state: "completed" as const, order: current };
    }
    const now = nowFn();
    const nowMs = now.getTime();
    if (
      current.fulfillmentStatus === "generating" &&
      current.generatingStartedAt &&
      nowMs - Date.parse(current.generatingStartedAt) < GENERATING_LEASE_TTL_MS
    ) {
      return { state: "busy" as const, order: current };
    }
    const nowIso = now.toISOString();
    const next: DirectOrderDoc = {
      ...current,
      fulfillmentStatus: "generating",
      generatingStartedAt: nowIso,
      lastError: null,
      updatedAt: nowIso,
    };
    tx.set(orderRef(orderId), next);
    if (current.periodKey) {
      tx.set(
        periodHoroscopeRef(current.profileId, current.periodKey),
        { status: "paid_pending", lastError: null, updatedAt: nowIso },
        { merge: true },
      );
    }
    return { state: "acquired" as const, order: next };
  });

  if (lease.state === "completed") {
    return {
      status: "completed",
      orderId: lease.order.orderId,
      service: lease.order.service,
      periodType: lease.order.periodType,
      periodKey: lease.order.periodKey,
      periodStart: lease.order.periodStart,
      periodEnd: lease.order.periodEnd,
      text: lease.order.resultText,
      resultId: lease.order.resultId,
      meta: lease.order.resultMeta,
    };
  }

  if (lease.state === "busy") {
    return {
      status: "pending",
      orderId: lease.order.orderId,
      service: lease.order.service,
      periodType: lease.order.periodType,
      periodKey: lease.order.periodKey,
      periodStart: lease.order.periodStart,
      periodEnd: lease.order.periodEnd,
      text: null,
      resultId: null,
      meta: null,
    };
  }

  const activeOrder = lease.order;
  try {
    let resultText = "";
    let resultId: string | null = null;
    let resultMeta: DirectOrderResultMeta;

    if (activeOrder.service === "situation") {
      const question = activeOrder.input.question ?? "";
      const out = await generateSituationForecast({
        profileId: activeOrder.profileId,
        uid: activeOrder.ownerUid,
        question,
        language: activeOrder.language,
        relocationLat: activeOrder.relocationLat,
        relocationLng: activeOrder.relocationLng,
        periodStart: activeOrder.periodStart,
        periodEnd: activeOrder.periodEnd,
        orderId: activeOrder.orderId,
      });
      resultText = out.answer;
      resultId = out.entryId;
      resultMeta = {
        model: out.model,
        generatedAt: nowFn().toISOString(),
        periodStart: out.periodStart,
        periodEnd: out.periodEnd,
        question,
      };
    } else if (activeOrder.service === "relationship") {
      if (!activeOrder.input.partner) {
        throw new HttpsError("failed-precondition", "Missing partner input on relationship order");
      }
      const partner = activeOrder.input.partner;
      const out = await generateRelationshipForecast({
        profileId: activeOrder.profileId,
        uid: activeOrder.ownerUid,
        partner,
        language: activeOrder.language,
        relocationLat: activeOrder.relocationLat,
        relocationLng: activeOrder.relocationLng,
        periodStart: activeOrder.periodStart,
        periodEnd: activeOrder.periodEnd,
        orderId: activeOrder.orderId,
      });
      resultText = out.answer;
      resultId = out.readingId;
      resultMeta = {
        model: out.model,
        generatedAt: out.generatedAt,
        periodStart: out.periodStart,
        periodEnd: out.periodEnd,
        partnerTimezone: out.partnerTimezone,
        partnerName: partner.name,
        partnerBirthDate: partner.birthDate,
        partnerBirthPlace: partner.birthPlace,
      };
    } else {
      const periodType = activeOrder.periodType!;
      const out = await generatePeriodHoroscope({
        profileId: activeOrder.profileId,
        uid: activeOrder.ownerUid,
        periodType,
        periodStart: activeOrder.periodStart,
        periodEnd: activeOrder.periodEnd,
        language: activeOrder.language,
        relocationLat: activeOrder.relocationLat,
        relocationLng: activeOrder.relocationLng,
      });
      resultText = out.text;
      resultId = activeOrder.periodKey;
      resultMeta = {
        model: out.model,
        generatedAt: out.generatedAt,
        periodStart: out.periodStart,
        periodEnd: out.periodEnd,
        periodKey: activeOrder.periodKey ?? undefined,
        periodType,
      };
    }

    const doneIso = nowFn().toISOString();
    const cleanMeta: Record<string, unknown> = {
      model: resultMeta.model,
      generatedAt: resultMeta.generatedAt,
      periodStart: resultMeta.periodStart,
      periodEnd: resultMeta.periodEnd,
    };
    if (resultMeta.partnerTimezone) cleanMeta.partnerTimezone = resultMeta.partnerTimezone;
    if (resultMeta.partnerName) cleanMeta.partnerName = resultMeta.partnerName;
    if (resultMeta.partnerBirthDate) cleanMeta.partnerBirthDate = resultMeta.partnerBirthDate;
    if (resultMeta.partnerBirthPlace) cleanMeta.partnerBirthPlace = resultMeta.partnerBirthPlace;
    if (resultMeta.question) cleanMeta.question = resultMeta.question;
    if (resultMeta.periodKey) cleanMeta.periodKey = resultMeta.periodKey;
    if (resultMeta.periodType) cleanMeta.periodType = resultMeta.periodType;

    await db().runTransaction(async (tx) => {
      tx.set(
        orderRef(orderId),
        {
          fulfillmentStatus: "completed",
          resultId,
          resultText,
          resultMeta: cleanMeta,
          fulfilledAt: doneIso,
          lastError: null,
          updatedAt: doneIso,
        },
        { merge: true },
      );
      if (activeOrder.periodKey && activeOrder.periodType) {
        tx.set(
          periodHoroscopeRef(activeOrder.profileId, activeOrder.periodKey),
          {
            profileId: activeOrder.profileId,
            ownerUid: activeOrder.ownerUid,
            periodType: activeOrder.periodType,
            periodKey: activeOrder.periodKey,
            periodStart: activeOrder.periodStart,
            periodEnd: activeOrder.periodEnd,
            language: activeOrder.language,
            status: "completed",
            orderId: activeOrder.orderId,
            checkoutExpiresAt: null,
            text: resultText,
            model: resultMeta.model,
            generatedAt: resultMeta.generatedAt,
            lastError: null,
            updatedAt: doneIso,
          },
          { merge: true },
        );
      }
    });

    // Fully star-funded order: record purchase ($0 USD) AFTER order completes
    // successfully, deduplicated by unique order ID without any Stripe session (DEC-008).
    if (activeOrder.paymentPath === "stars_only") {
      try {
        await recordCompletedStarOrderPurchase(activeOrder, { sendGa4: deps.sendGa4 });
      } catch (analyticsErr) {
        logger.warn("Failed to record star-only purchase analytics", {
          orderId,
          error: (analyticsErr as Error).message,
        });
      }
    }

    return {
      status: "completed",
      orderId: activeOrder.orderId,
      service: activeOrder.service,
      periodType: activeOrder.periodType,
      periodKey: activeOrder.periodKey,
      periodStart: activeOrder.periodStart,
      periodEnd: activeOrder.periodEnd,
      text: resultText,
      resultId,
      meta: resultMeta,
    };
  } catch (error) {
    const failIso = nowFn().toISOString();
    const message = error instanceof Error ? error.message : "Generation failed";
    // Preserve paymentStatus === "paid" so the user can recover and retry under
    // the original order without paying USD or spending stars again (REQ-005 AC #15).
    await db().runTransaction(async (tx) => {
      tx.set(
        orderRef(orderId),
        {
          fulfillmentStatus: "failed",
          lastError: message.slice(0, 500),
          generatingStartedAt: null,
          updatedAt: failIso,
        },
        { merge: true },
      );
      if (activeOrder.periodKey) {
        tx.set(
          periodHoroscopeRef(activeOrder.profileId, activeOrder.periodKey),
          {
            status: "failed",
            lastError: message.slice(0, 500),
            updatedAt: failIso,
          },
          { merge: true },
        );
      }
    });

    if (error instanceof HttpsError) throw error;
    logger.error("fulfillDirectOrder failed", { orderId, service: activeOrder.service, error: message });
    throw new HttpsError("internal", "Failed to generate forecast; retry is available under your paid order");
  }
}
