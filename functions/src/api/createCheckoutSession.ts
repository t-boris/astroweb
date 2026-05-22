import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import Stripe from "stripe";
import * as admin from "firebase-admin";
import * as profileService from "../services/profile";

export const createCheckoutSession = onCall(async (request) => {
  const { data } = request;
  const { profileId, ownerDeviceId, tier } = data; // tier: 'pdf' | 'oracle' | 'compatibility'

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
  const origin = request.rawRequest.headers.origin || "http://localhost:5173";

  if (!stripeKey || stripeKey === "mock") {
    logger.warn("STRIPE_SECRET_KEY not set or is mock. Using mock payment flow.");
    
    // Direct DB update to mock the webhook behavior
    const db = admin.firestore();
    const profileRef = db.collection("profiles").doc(profileId);
    
    try {
      if (tier === "pdf") {
        await profileRef.update({ hasPremiumPdf: true });
        
        // Mock queueing the PDF job
        await db.collection("pdfJobs").add({
          profileId,
          ownerDeviceId,
          profileName: profile.name,
          customerEmail: "mock@example.com",
          status: "pending",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else if (tier === "oracle") {
        await profileRef.update({
          oracleCredits: admin.firestore.FieldValue.increment(1)
        });
      } else if (tier === "compatibility") {
        await profileRef.update({ hasPremiumCompatibility: true });
      }
      return { url: `${origin}/profile/${profileId}?checkout=success` };
    } catch (e) {
      logger.error("Mock payment update failed", { error: (e as Error).message });
      throw new HttpsError("internal", "Mock payment failed");
    }
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2024-04-10" as any, // use latest compatible or ignore typed error
  });

  try {
    let amount = 99; // $0.99 for all tiers
    let name = "";
    if (tier === "pdf") {
      name = "Premium PDF Reading";
    } else if (tier === "oracle") {
      name = "Oracle Question";
    } else if (tier === "compatibility") {
      name = "Relationship Compatibility";
    } else {
      throw new HttpsError("invalid-argument", "Invalid tier");
    }

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
