import { onCall, HttpsError } from "firebase-functions/v2/https";
import { requireUid } from "../services/astrologer";
import { savePushSubscription, removePushSubscription } from "../services/webpush";

export const registerPushSubscription = onCall(async (request) => {
  const uid = requireUid(request);
  const sub = request.data?.subscription;
  if (!sub || typeof sub.endpoint !== "string") {
    throw new HttpsError("invalid-argument", "subscription is required");
  }
  await savePushSubscription(uid, sub);
  return { ok: true };
});

export const unregisterPushSubscription = onCall(async (request) => {
  const uid = requireUid(request);
  const endpoint = request.data?.endpoint;
  if (typeof endpoint !== "string") throw new HttpsError("invalid-argument", "endpoint is required");
  await removePushSubscription(uid, endpoint);
  return { ok: true };
});
