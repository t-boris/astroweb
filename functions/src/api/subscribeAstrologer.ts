import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import Stripe from "stripe";
import { getFirestore } from "firebase-admin/firestore";
import * as profileService from "../services/profile";
import { ownsProfile } from "../services/owner";
import { requireUid, isAstrologerEnabled } from "../services/astrologer";
import { priceCents, stripeInterval } from "../services/pricing";
import { parseRecipientEmails } from "../services/email";
import { enqueueImmediateLetter } from "../services/letterEngine";

const CADENCES = new Set(["daily", "every_2_days", "every_5_days", "weekly", "every_2_weeks"]);

/**
 * Create a Stripe Checkout (subscription mode) for hiring a Personal Astrologer
 * on a chart. Account-only + feature-flag gated. The subscription doc is created
 * by the webhook on payment; in the emulator it is created directly (mock).
 */
export const subscribeAstrologer = onCall({ secrets: ["STRIPE_SECRET_KEY"] }, async (request) => {
  const uid = requireUid(request);
  if (!(await isAstrologerEnabled(uid))) {
    throw new HttpsError("permission-denied", "Personal Astrologer is not enabled for this account yet");
  }
  const profileId = request.data?.profileId;
  const cadence = request.data?.cadence;
  const period = request.data?.billingPeriod === "annual" ? "annual" : "monthly";
  // Push delivery is a global per-user setting (browser registration on the
  // Account page), not a per-subscription channel — so only `email` is stored here.
  const channels = {
    inApp: true,
    email: request.data?.channels?.email !== false,
  };
  // Custom letter recipients (comma-separated or array). Empty = account email.
  const recipientEmails = parseRecipientEmails(request.data?.recipientEmails);
  const astrologerName = String(request.data?.astrologerName || "Vega").slice(0, 40);

  if (typeof profileId !== "string" || !profileId) throw new HttpsError("invalid-argument", "profileId is required");
  if (!CADENCES.has(cadence)) throw new HttpsError("invalid-argument", "Invalid cadence");

  const profile = await profileService.getProfileById(profileId);
  if (!profile) throw new HttpsError("not-found", "Profile not found");
  if (!ownsProfile(profile, { uid, deviceId: null })) throw new HttpsError("permission-denied", "Access denied");

  const amount = priceCents(cadence, period);
  const origin = request.rawRequest.headers.origin || "http://localhost:5173";
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";

  if (!stripeKey || stripeKey === "mock") {
    if (!isEmulator) {
      logger.error("STRIPE_SECRET_KEY not configured — refusing astrologer subscription in production");
      throw new HttpsError("failed-precondition", "Payments are not available right now");
    }
    // Emulator-only mock: create the subscription directly.
    const now = new Date().toISOString();
    await getFirestore().collection("subscriptions").doc(profileId).set({
      profileId, ownerUid: uid, status: "active", cadence, billingPeriod: period,
      provider: "stripe", providerRef: "mock", priceCents: amount, starsPerCycle: 1,
      channels, recipientEmails, currentPeriodStart: now, currentPeriodEnd: now, nextLetterAt: now,
      pausedUntil: null, canceledAt: null, astrologerName, createdAt: now, updatedAt: now,
    });
    await enqueueImmediateLetter(profileId, uid, cadence);
    return { url: `${origin}/profile/${profileId}/letters?sub=success` };
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" as never });
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: `Personal Astrologer — ${cadence.replace(/_/g, " ")}` },
            unit_amount: amount,
            recurring: { interval: stripeInterval(period) },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/profile/${profileId}/letters?sub=success`,
      cancel_url: `${origin}/profile/${profileId}/letters?sub=cancel`,
      metadata: {
        kind: "astrologer",
        profileId,
        ownerUid: uid,
        cadence,
        period,
        astrologerName,
        channels: JSON.stringify(channels),
        recipientEmails: recipientEmails.join(","),
      },
    });
    return { url: session.url };
  } catch (error) {
    logger.error("subscribeAstrologer failed", { error: (error as Error).message });
    throw new HttpsError("internal", "Failed to create subscription checkout");
  }
});
