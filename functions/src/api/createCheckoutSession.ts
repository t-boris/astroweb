import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import Stripe from "stripe";
import * as profileService from "../services/profile";
import { ownsProfile, requireAccount } from "../services/owner";
import { grantToWallet, isFirstReadingAvailable, walletKeyFromCtx } from "../services/wallet";
import { getStarPack } from "../services/starPacks";
import { analyticsMetadata, parseClientAnalytics } from "../services/ga4";

const PRICE_PER_TOKEN = 99; // cents ($0.99) — legacy quantity path
const MAX_TOKENS_PER_PURCHASE = 100;

interface ResolvedOrder {
  /** Stars credited on fulfilment (base + any bonus). */
  stars: number;
  /** Stripe line-item quantity. */
  quantity: number;
  /** Per-unit price in cents. */
  unitAmount: number;
  /** Product name shown on the Stripe checkout. */
  productName: string;
  /** True when the one-time first-reading discount is being applied. */
  firstReading: boolean;
  /** Catalog pack id; undefined on the legacy quantity path. */
  packId?: string;
}

/**
 * Create a Stripe Checkout session to buy stars. Preferred input is a `packId`
 * (price + credited stars resolved server-side from the catalog, supporting
 * bonus stars and the one-time first-reading discount). A legacy `quantity`
 * input (N stars at $0.99) is still accepted as a fallback. Stars are credited
 * by the stripeWebhook on confirmed payment.
 */
export const createCheckoutSession = onCall({
  secrets: ["STRIPE_SECRET_KEY"],
}, async (request) => {
  // Buying stars requires an account (DEC-001, REQ-006).
  const uid = requireAccount(request);
  const { data } = request;
  const { profileId, ownerDeviceId } = data;
  const packId = data?.packId;

  if (!profileId) {
    throw new HttpsError("invalid-argument", "Missing required fields");
  }

  // Verify ownership (account or device)
  const ctx = { uid, deviceId: null };
  const profile = await profileService.getProfileById(profileId);
  if (!profile) {
    throw new HttpsError("not-found", "Profile not found");
  }
  if (!ownsProfile(profile, ctx)) {
    throw new HttpsError("permission-denied", "Not authorized");
  }

  // Stars are credited to the buyer's per-user wallet, not a single profile.
  const walletKey = walletKeyFromCtx(ctx);

  // Resolve the order server-side: never trust price or credited stars from the
  // client.
  let order: ResolvedOrder;
  if (packId !== undefined && packId !== null && packId !== "") {
    const pack = getStarPack(packId);
    if (!pack) {
      throw new HttpsError("invalid-argument", "Invalid pack");
    }
    const firstReading =
      pack.firstPriceCents !== undefined && (await isFirstReadingAvailable(walletKey));
    const unitAmount = firstReading ? pack.firstPriceCents! : pack.priceCents;
    order = {
      stars: pack.stars + pack.bonusStars,
      quantity: 1,
      unitAmount,
      productName: `AstroWeb · ${pack.id}`,
      firstReading,
      packId: pack.id,
    };
  } else {
    const quantity = Math.floor(Number(data?.quantity));
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > MAX_TOKENS_PER_PURCHASE) {
      throw new HttpsError("invalid-argument", "Invalid token quantity");
    }
    order = {
      stars: quantity,
      quantity,
      unitAmount: PRICE_PER_TOKEN,
      productName: `AstroWeb Stars ×${quantity}`,
      firstReading: false,
    };
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const origin = request.rawRequest.headers.origin || "http://localhost:5173";
  const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";

  if (!stripeKey || stripeKey === "mock") {
    // Fail closed in production: never grant tokens for free.
    if (!isEmulator) {
      logger.error("STRIPE_SECRET_KEY not configured — refusing checkout in production");
      throw new HttpsError("failed-precondition", "Payments are not available right now");
    }

    logger.warn("STRIPE_SECRET_KEY not set — mock star grant (emulator only).");
    await grantToWallet(walletKey, order.stars);
    return { url: `${origin}/profile/${profileId}?checkout=success` };
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2024-04-10" as any,
  });

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: order.productName,
            },
            unit_amount: order.unitAmount,
          },
          quantity: order.quantity,
        },
      ],
      mode: "payment",
      success_url: `${origin}/profile/${profileId}?checkout=success`,
      cancel_url: `${origin}/profile/${profileId}?checkout=cancel`,
      metadata: {
        profileId,
        ownerDeviceId,
        walletKey,
        tokens: String(order.stars),
        ...(order.firstReading ? { firstReading: "1" } : {}),
        ...(order.packId ? { packId: order.packId } : {}),
        // Analytics consent + GA client_id at checkout time (REQ-002).
        ...analyticsMetadata(parseClientAnalytics(data?.analytics), ctx.uid),
      },
    });

    return { url: session.url };
  } catch (error) {
    logger.error("createCheckoutSession failed", { error: (error as Error).message });
    throw new HttpsError("internal", "Failed to create checkout session");
  }
});
