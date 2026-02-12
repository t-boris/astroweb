import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import * as profileService from "../services/profile";

export const listProfiles = onCall(async (request) => {
  const { data } = request;

  // Validate ownerDeviceId
  if (
    typeof data?.ownerDeviceId !== "string" ||
    data.ownerDeviceId.trim().length === 0
  ) {
    throw new HttpsError("invalid-argument", "ownerDeviceId is required");
  }

  logger.info("listProfiles called", { ownerDeviceId: data.ownerDeviceId });

  try {
    const profiles = await profileService.listProfilesByOwner(
      data.ownerDeviceId
    );
    return { profiles };
  } catch (error) {
    logger.error("listProfiles failed", { ownerDeviceId: data.ownerDeviceId, error: (error as Error).message });
    throw new HttpsError("internal", "An unexpected error occurred");
  }
});
