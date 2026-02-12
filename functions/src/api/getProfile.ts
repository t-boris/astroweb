import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import * as profileService from "../services/profile";

export const getProfile = onCall(async (request) => {
  const { data } = request;

  // Validate inputs
  if (
    typeof data?.profileId !== "string" ||
    data.profileId.trim().length === 0
  ) {
    throw new HttpsError("invalid-argument", "profileId is required");
  }

  if (
    typeof data?.ownerDeviceId !== "string" ||
    data.ownerDeviceId.trim().length === 0
  ) {
    throw new HttpsError("invalid-argument", "ownerDeviceId is required");
  }

  logger.info("getProfile called", { profileId: data.profileId });

  try {
    const profile = await profileService.getProfileById(data.profileId);

    if (!profile) {
      throw new HttpsError("not-found", "Profile not found");
    }

    // Ownership check
    if (profile.ownerDeviceId !== data.ownerDeviceId) {
      throw new HttpsError("permission-denied", "Access denied");
    }

    return profile;
  } catch (error) {
    // Re-throw HttpsError instances as-is
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error("getProfile failed", { profileId: data.profileId, error: (error as Error).message });
    throw new HttpsError("internal", "An unexpected error occurred");
  }
});
