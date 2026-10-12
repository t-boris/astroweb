import webpush from "web-push";
import { createHash } from "crypto";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";

// Public VAPID key — safe to embed (the private key is a secret).
export const VAPID_PUBLIC_KEY = "BOEN7U-6D90CxpnjAWz0rzpHN82gXYfNY3pym7NRKfnnBMP_bfj5yLKMjHm7iIu8Ix92R6kKvtXuHSzAox0ItlY";

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!priv) return false;
  webpush.setVapidDetails("mailto:t.boris@gmail.com", VAPID_PUBLIC_KEY, priv);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

function subId(endpoint: string): string {
  return createHash("sha1").update(endpoint).digest("hex").slice(0, 40);
}

/** Store a browser push subscription under the user (one per browser/endpoint). */
export async function savePushSubscription(uid: string, sub: { endpoint: string }): Promise<void> {
  await getFirestore()
    .collection("pushSubscriptions")
    .doc(uid)
    .collection("items")
    .doc(subId(sub.endpoint))
    .set({ subscription: sub, createdAt: new Date().toISOString() });
}

export async function removePushSubscription(uid: string, endpoint: string): Promise<void> {
  await getFirestore().collection("pushSubscriptions").doc(uid).collection("items").doc(subId(endpoint)).delete();
}

/** Send a push to all of a user's registered browsers. Prunes dead subscriptions. */
export async function sendPushToUser(uid: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) {
    logger.warn("VAPID_PRIVATE_KEY missing — skipping push");
    return;
  }
  const db = getFirestore();
  const snap = await db.collection("pushSubscriptions").doc(uid).collection("items").get();
  if (snap.empty) return;
  await Promise.all(
    snap.docs.map(async (d) => {
      const sub = d.data().subscription;
      try {
        await webpush.sendNotification(sub, JSON.stringify(payload));
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await d.ref.delete();
        else logger.warn("push send failed", { error: (e as Error).message });
      }
    }),
  );
}
