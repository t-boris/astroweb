import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import * as profileService from "../services/profile";
import { ownerCtx, ownsProfile } from "../services/owner";

export const deleteProfile = onCall(async (request) => {
  const { data } = request;

  if (typeof data?.profileId !== "string" || data.profileId.trim().length === 0) {
    throw new HttpsError("invalid-argument", "profileId is required");
  }

  const ctx = ownerCtx(request);

  try {
    // Ownership check: fetch profile first
    const existing = await profileService.getProfileById(data.profileId);

    if (!existing) {
      throw new HttpsError("not-found", "Profile not found");
    }

    if (!ownsProfile(existing, ctx)) {
      throw new HttpsError("permission-denied", "Access denied");
    }

    await profileService.deleteProfile(data.profileId);
    return { success: true };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error("deleteProfile failed", { profileId: data.profileId, error: (error as Error).message });
    throw new HttpsError("internal", "An unexpected error occurred");
  }
});
