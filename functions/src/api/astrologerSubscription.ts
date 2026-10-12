import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import Stripe from "stripe";
import { getFirestore } from "firebase-admin/firestore";
import * as profileService from "../services/profile";
import { ownsProfile } from "../services/owner";
import { requireUid } from "../services/astrologer";
import { parseRecipientEmails } from "../services/email";

async function authorize(request: CallableRequest): Promise<{ uid: string; profileId: string }> {
  const uid = requireUid(request);
  const profileId = request.data?.profileId;
  if (typeof profileId !== "string" || !profileId) throw new HttpsError("invalid-argument", "profileId is required");
  const profile = await profileService.getProfileById(profileId);
  if (!profile) throw new HttpsError("not-found", "Profile not found");
  if (!ownsProfile(profile, { uid, deviceId: null })) throw new HttpsError("permission-denied", "Access denied");
  return { uid, profileId };
}

function subRef(profileId: string) {
  return getFirestore().collection("subscriptions").doc(profileId);
}

function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key === "mock") throw new HttpsError("failed-precondition", "Payments not available");
  return new Stripe(key, { apiVersion: "2024-04-10" as never });
}

export const getAstrologerStatus = onCall(async (request) => {
  const { profileId } = await authorize(request);
  const snap = await subRef(profileId).get();
  return { subscription: snap.exists ? snap.data() : null };
});

export const cancelSubscription = onCall({ secrets: ["STRIPE_SECRET_KEY"] }, async (request) => {
  const { profileId } = await authorize(request);
  const snap = await subRef(profileId).get();
  if (!snap.exists) throw new HttpsError("not-found", "No subscription");
  const sub = snap.data() as { providerRef?: string };
  // Cancel at period end — access (and dossier/✦) preserved until then.
  if (sub.providerRef && sub.providerRef !== "mock") {
    try {
      await stripe().subscriptions.update(sub.providerRef, { cancel_at_period_end: true });
    } catch (e) {
      logger.error("cancelSubscription stripe failed", { profileId, error: (e as Error).message });
    }
  }
  await subRef(profileId).set({ canceledAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
  return { ok: true };
});

export const pauseSubscription = onCall({ secrets: ["STRIPE_SECRET_KEY"] }, async (request) => {
  const { profileId } = await authorize(request);
  const snap = await subRef(profileId).get();
  if (!snap.exists) throw new HttpsError("not-found", "No subscription");
  const sub = snap.data() as { providerRef?: string };
  if (sub.providerRef && sub.providerRef !== "mock") {
    try {
      await stripe().subscriptions.update(sub.providerRef, { pause_collection: { behavior: "void" } });
    } catch (e) {
      logger.error("pauseSubscription stripe failed", { profileId, error: (e as Error).message });
    }
  }
  // status=paused → scheduler skips (only generates for active).
  await subRef(profileId).set({ status: "paused", updatedAt: new Date().toISOString() }, { merge: true });
  return { ok: true };
});

export const resumeSubscription = onCall({ secrets: ["STRIPE_SECRET_KEY"] }, async (request) => {
  const { profileId } = await authorize(request);
  const snap = await subRef(profileId).get();
  if (!snap.exists) throw new HttpsError("not-found", "No subscription");
  const sub = snap.data() as { providerRef?: string };
  if (sub.providerRef && sub.providerRef !== "mock") {
    try {
      await stripe().subscriptions.update(sub.providerRef, { pause_collection: "" as unknown as null });
    } catch (e) {
      logger.error("resumeSubscription stripe failed", { profileId, error: (e as Error).message });
    }
  }
  await subRef(profileId).set({ status: "active", nextLetterAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
  return { ok: true };
});

export const setSubscriptionChannels = onCall(async (request) => {
  const { profileId } = await authorize(request);
  // Push is a global per-user setting (Account page), not a per-subscription channel.
  const channels = {
    inApp: true,
    email: request.data?.channels?.email !== false,
  };
  const recipientEmails = parseRecipientEmails(request.data?.recipientEmails);
  await subRef(profileId).set(
    { channels, recipientEmails, updatedAt: new Date().toISOString() },
    { merge: true },
  );
  return { ok: true };
});
