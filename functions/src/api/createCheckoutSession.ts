import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import Stripe from "stripe";
import * as profileService from "../services/profile";

export const createCheckoutSession = onCall(async (request) => {
  const { data } = request;
  const { profileId, ownerDeviceId, tier } = data; // tier: 'pdf' | 'oracle'

  if (!profileId || !ownerDeviceId || !tier) {
    throw new HttpsError("invalid-argument", "Missing required fields");
  }

  // Verify ownership
  const profile = await profileService.getProfileById(profileId);
  if (!profile) {
    throw new HttpsError("not-found", "Profile not found");
  }
  if (profile.ownerDeviceId !== ownerDeviceId) {
    throw new HttpsError("permission-denied", "Not authorized");
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    logger.error("Missing STRIPE_SECRET_KEY");
    throw new HttpsError("internal", "Stripe not configured");
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2024-04-10" as any, // use latest compatible or ignore typed error
  });

  try {
    let amount = 0;
    let name = "";
    if (tier === "pdf") {
      amount = 500; // $5.00
      name = "Premium PDF Reading";
    } else if (tier === "oracle") {
      amount = 100; // $1.00
      name = "Oracle Question";
    } else {
      throw new HttpsError("invalid-argument", "Invalid tier");
    }

    const origin = request.rawRequest.headers.origin || "http://localhost:5173";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name,
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/profile/${profileId}?checkout=success`,
      cancel_url: `${origin}/profile/${profileId}?checkout=cancel`,
      metadata: {
        profileId,
        ownerDeviceId,
        tier,
      },
    });

    return { url: session.url };
  } catch (error) {
    logger.error("createCheckoutSession failed", { error: (error as Error).message });
    throw new HttpsError("internal", "Failed to create checkout session");
  }
});
