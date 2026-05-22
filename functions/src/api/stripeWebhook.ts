import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import Stripe from "stripe";
import * as admin from "firebase-admin";

export const stripeWebhook = onRequest(async (req, res) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey || !endpointSecret) {
    logger.error("Missing Stripe config");
    res.status(500).send("Configuration error");
    return;
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2024-04-10" as any,
  });

  const sig = req.headers["stripe-signature"];
  if (!sig) {
    res.status(400).send("No signature");
    return;
  }

  let event: any;

  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
  } catch (err) {
    logger.error("Webhook signature verification failed", { error: (err as Error).message });
    res.status(400).send(`Webhook Error: ${(err as Error).message}`);
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as any;
    const { profileId, ownerDeviceId, tier } = session.metadata || {};

    if (profileId && tier) {
      const db = admin.firestore();
      const profileRef = db.collection("profiles").doc(profileId);
      
      try {
        if (tier === "pdf") {
          await profileRef.update({ hasPremiumPdf: true });
          
          const profileDoc = await profileRef.get();
          const profileData = profileDoc.data();
          const customerEmail = session.customer_details?.email;

          if (profileData && customerEmail) {
            await db.collection("pdfJobs").add({
              profileId,
              ownerDeviceId,
              profileName: profileData.name,
              customerEmail,
              status: "pending",
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            logger.info(`Queued PDF premium job for profile ${profileId}`);
          }
        } else if (tier === "oracle") {
          await profileRef.update({
            oracleCredits: admin.firestore.FieldValue.increment(1)
          });
          logger.info(`Added oracle credit to profile ${profileId}`);
        }
      } catch (e) {
        logger.error("Failed to update profile", { profileId, error: (e as Error).message });
      }
    }
  }

  res.json({ received: true });
});
