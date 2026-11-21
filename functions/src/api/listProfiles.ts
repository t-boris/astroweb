import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import * as profileService from "../services/profile";
import { loadSubscriptionDocs, withSubscriptions } from "../services/subscriptionSummary";

export const listProfiles = onCall(async (request) => {
  const { data } = request;
  const uid = request.auth?.uid ?? null;
  const deviceId =
    typeof data?.ownerDeviceId === "string" && data.ownerDeviceId.trim()
      ? data.ownerDeviceId.trim()
      : null;

  if (!uid && !deviceId) {
    throw new HttpsError("invalid-argument", "ownerDeviceId is required");
  }

  try {
    // Signed-in: list by account (cross-device). Anonymous: by device id.
    if (!uid) return { profiles: await profileService.listProfilesByOwner(deviceId!) };
    // A subscription needs an account, so only an account's list carries the subscription marks.
    const owned = await profileService.listProfilesByUid(uid);
    const profiles = await withSubscriptions(owned, loadSubscriptionDocs, new Date(), (error) =>
      logger.warn("listProfiles: subscription summary skipped", { uid, error: error.message }),
    );
    return { profiles };
  } catch (error) {
    logger.error("listProfiles failed", { uid, error: (error as Error).message });
    throw new HttpsError("internal", "An unexpected error occurred");
  }
});
