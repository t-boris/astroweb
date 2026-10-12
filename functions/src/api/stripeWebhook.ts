import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import Stripe from "stripe";
import * as admin from "firebase-admin";
import { getProfileById } from "../services/profile";
import { grantToWallet, markFirstReadingUsed, walletKeyFromProfile } from "../services/wallet";
import { parseRecipientEmails } from "../services/email";
import { enqueueImmediateLetter } from "../services/letterEngine";
import { purchaseEvent, readAnalyticsMetadata, sendGa4Once, subscriptionEvent } from "../services/ga4";

/**
 * Stripe test-mode events must not pollute the production GA4 property (DEC-014);
 * a paid-or-free checkout is reported, an unpaid (async) one is not.
 */
function shouldReportToGa(event: { livemode?: boolean }, session?: { payment_status?: string }): boolean {
  if (event.livemode === false) return false;
  return !session || session.payment_status !== "unpaid";
}

export const stripeWebhook = onRequest({
  secrets: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "GA_API_SECRET"],
}, async (req, res) => {
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

  // Personal Astrologer subscription created.
  if (event.type === "checkout.session.completed" && (event.data.object as any).metadata?.kind === "astrologer") {
    const session = event.data.object as any;
    const m = session.metadata || {};
    try {
      const db = admin.firestore();
      const now = new Date().toISOString();
      let currentPeriodEnd = now;
      try {
        const stripeSub = (await stripe.subscriptions.retrieve(session.subscription as string)) as any;
        currentPeriodEnd = new Date((stripeSub.current_period_end ?? 0) * 1000).toISOString();
      } catch {
        /* best-effort */
      }
      let channels = { inApp: true, email: true, webPush: false };
      try {
        channels = { inApp: true, ...JSON.parse(m.channels || "{}") };
      } catch {
        /* default */
      }
      await db.collection("subscriptions").doc(m.profileId).set({
        profileId: m.profileId,
        ownerUid: m.ownerUid,
        status: "active",
        cadence: m.cadence,
        billingPeriod: m.period,
        provider: "stripe",
        providerRef: session.subscription,
        priceCents: session.amount_total ?? null,
        starsPerCycle: 1,
        channels,
        recipientEmails: parseRecipientEmails(m.recipientEmails),
        currentPeriodStart: now,
        currentPeriodEnd,
        nextLetterAt: now, // first letter on the next scheduler tick
        pausedUntil: null,
        canceledAt: null,
        astrologerName: m.astrologerName || "Vega",
        createdAt: now,
        updatedAt: now,
      });
      // Send the first letter right away (don't wait for the 15-min scheduler).
      await enqueueImmediateLetter(m.profileId, m.ownerUid, m.cadence);
      logger.info("astrologer subscription created", { profileId: m.profileId, sub: session.subscription });
    } catch (e) {
      logger.error("astrologer subscription fulfilment failed", { error: (e as Error).message });
    }
    // GA4 subscription_start — consent state is the one recorded at checkout.
    if (shouldReportToGa(event, session)) {
      await sendGa4Once(
        subscriptionEvent("subscription_start", {
          transactionId: session.id,
          amountCents: session.amount_total,
          currency: session.currency,
          cadence: m.cadence,
          billingPeriod: m.period,
        }),
        readAnalyticsMetadata(m),
        session.id,
      );
    }
    res.json({ received: true });
    return;
  }

  // Subscription canceled at period end → stop letters.
  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as any;
    const snap = await admin.firestore().collection("subscriptions").where("providerRef", "==", sub.id).limit(1).get();
    if (!snap.empty) {
      await snap.docs[0].ref.set({ status: "canceled", updatedAt: new Date().toISOString() }, { merge: true });
    }
    // GA4 subscription_cancel — consent follows the subscription metadata (DEC-007).
    if (shouldReportToGa(event) && (sub.metadata?.kind === "astrologer" || !snap.empty)) {
      const doc = snap.empty ? {} : snap.docs[0].data();
      await sendGa4Once(
        subscriptionEvent("subscription_cancel", {
          transactionId: event.id,
          cadence: sub.metadata?.cadence ?? doc.cadence,
          billingPeriod: sub.metadata?.period ?? doc.billingPeriod,
        }),
        readAnalyticsMetadata(sub.metadata),
        `${sub.id}:${event.id}`,
      );
    }
    res.json({ received: true });
    return;
  }

  // Failed renewal → past_due (scheduler skips; dunning nudges).
  if (event.type === "invoice.payment_failed") {
    const inv = event.data.object as any;
    if (inv.subscription) {
      const snap = await admin.firestore().collection("subscriptions").where("providerRef", "==", inv.subscription).limit(1).get();
      if (!snap.empty) {
        await snap.docs[0].ref.set({ status: "past_due", updatedAt: new Date().toISOString() }, { merge: true });
      }
    }
    res.json({ received: true });
    return;
  }

  // Successful renewal → ensure active + sync period end.
  if (event.type === "invoice.payment_succeeded") {
    const inv = event.data.object as any;
    if (inv.subscription) {
      const snap = await admin.firestore().collection("subscriptions").where("providerRef", "==", inv.subscription).limit(1).get();
      if (!snap.empty) {
        const periodEnd = inv.lines?.data?.[0]?.period?.end;
        await snap.docs[0].ref.set(
          {
            status: "active",
            ...(periodEnd ? { currentPeriodEnd: new Date(periodEnd * 1000).toISOString() } : {}),
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );
      }
      // GA4 subscription_renewal. The first invoice (billing_reason
      // subscription_create) is already reported as subscription_start.
      if (inv.billing_reason === "subscription_cycle" && shouldReportToGa(event)) {
        let subMeta: Record<string, string> = {};
        try {
          subMeta = ((await stripe.subscriptions.retrieve(inv.subscription as string)) as any).metadata ?? {};
        } catch (e) {
          logger.warn("could not read subscription metadata for GA4 renewal", { error: (e as Error).message });
        }
        const doc = snap.empty ? {} : snap.docs[0].data();
        await sendGa4Once(
          subscriptionEvent("subscription_renewal", {
            transactionId: inv.id,
            amountCents: inv.amount_paid,
            currency: inv.currency,
            cadence: subMeta.cadence ?? doc.cadence,
            billingPeriod: subMeta.period ?? doc.billingPeriod,
          }),
          readAnalyticsMetadata(subMeta),
          inv.id,
        );
      }
    }
    res.json({ received: true });
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as any;
    const { profileId, ownerDeviceId, tier, tokens, walletKey: metaWalletKey, packId } = session.metadata || {};
    const tokenQty = Number(tokens) || 0;
    // Wallet key of the buyer: from the checkout metadata, else resolved from the profile below.
    let buyerWalletKey: string | undefined = metaWalletKey;

    if (profileId) {
      const db = admin.firestore();
      const profileRef = db.collection("profiles").doc(profileId);
      // Use the Stripe session id as the purchase doc id for idempotency:
      // Stripe may deliver the same event more than once.
      const purchaseRef = db.collection("purchases").doc(session.id);

      try {
        const alreadyFulfilled = await purchaseRef.get();
        if (alreadyFulfilled.exists) {
          logger.info(`Purchase ${session.id} already fulfilled, skipping`);
        } else {
          if (tokenQty > 0) {
            // Token purchase (current model) — credit the per-user wallet.
            let key = metaWalletKey as string | undefined;
            if (!key) {
              const prof = await getProfileById(profileId);
              key = (prof && walletKeyFromProfile(prof)) || undefined;
            }
            buyerWalletKey = key;
            if (key) {
              await grantToWallet(key, tokenQty);
              // Consume the one-time first-reading discount (after the grant so
              // the lazy legacy-token migration isn't short-circuited).
              if (session.metadata?.firstReading === "1") {
                await markFirstReadingUsed(key);
              }
              logger.info(`Granted ${tokenQty} stars to wallet ${key} (profile ${profileId})`);
            } else {
              logger.error("No wallet key for token purchase", { profileId, session: session.id });
            }
          } else if (tier === "pdf") {
            // Legacy per-feature purchases (in-flight sessions only).
            await profileRef.update({ hasPremiumPdf: true });
          } else if (tier === "oracle") {
            await profileRef.update({
              oracleCredits: admin.firestore.FieldValue.increment(1)
            });
          } else if (tier === "compatibility") {
            await profileRef.update({ hasPremiumCompatibility: true });
          }

          // Record the transaction for audit/accounting.
          await purchaseRef.set({
            profileId,
            ownerDeviceId: ownerDeviceId ?? null,
            tier: tier ?? (tokenQty > 0 ? "tokens" : null),
            tokens: tokenQty,
            amountTotal: session.amount_total ?? null,
            currency: session.currency ?? null,
            paymentStatus: session.payment_status ?? null,
            // Used by the admin Business tab (DEC-012).
            livemode: session.livemode === true,
            packId: packId ?? null,
            walletKey: buyerWalletKey ?? null,
            ownerUid: buyerWalletKey && !buyerWalletKey.startsWith("device:") ? buyerWalletKey : null,
            stripeSessionId: session.id,
            stripePaymentIntent: session.payment_intent ?? null,
            customerEmail: session.customer_details?.email ?? null,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          logger.info(`Recorded purchase ${session.id} (tokens=${tokenQty}) for profile ${profileId}`);
        }
      } catch (e) {
        logger.error("Failed to fulfill purchase", { profileId, error: (e as Error).message });
      }

      // GA4 purchase. The marker written by sendGa4Once makes a redelivered
      // webhook send nothing; a failed first attempt is retried on redelivery.
      if (shouldReportToGa(event, session)) {
        await sendGa4Once(
          purchaseEvent({
            transactionId: session.id,
            amountCents: session.amount_total,
            currency: session.currency,
            packId,
            stars: tokenQty,
          }),
          readAnalyticsMetadata(session.metadata),
          session.id,
        );
      }
    }
  }

  res.json({ received: true });
});
