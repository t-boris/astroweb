import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import * as profileService from "../services/profile";

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
    const profiles = uid
      ? await profileService.listProfilesByUid(uid)
      : await profileService.listProfilesByOwner(deviceId!);
    return { profiles };
  } catch (error) {
    logger.error("listProfiles failed", { uid, error: (error as Error).message });
    throw new HttpsError("internal", "An unexpected error occurred");
  }
});
