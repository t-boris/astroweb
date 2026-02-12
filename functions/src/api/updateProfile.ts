import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { validateUpdateProfilePayload } from "../validation/profile";
import * as profileService from "../services/profile";
import { getTimezoneFromCoords } from "../utils/timezone";

export const updateProfile = onCall(async (request) => {
  const { data } = request;

  // Validate profileId
  if (
    typeof data?.profileId !== "string" ||
    data.profileId.trim().length === 0
  ) {
    throw new HttpsError("invalid-argument", "profileId is required");
  }

  // Validate update payload
  const errors = validateUpdateProfilePayload(data);
  if (errors.length > 0) {
    throw new HttpsError("invalid-argument", errors[0].message);
  }

  logger.info("updateProfile called", { profileId: data.profileId });

  try {
    // Ownership check: fetch profile first
    const existing = await profileService.getProfileById(data.profileId);

    if (!existing) {
      throw new HttpsError("not-found", "Profile not found");
    }

    if (existing.ownerDeviceId !== data.ownerDeviceId) {
      throw new HttpsError("permission-denied", "Access denied");
    }

    // Extract update fields (exclude ownerDeviceId and profileId)
    const { ownerDeviceId, profileId, ...updateFields } = data;

    // Re-resolve timezone when coordinates change and timezone not explicitly provided
    if (
      (updateFields.lat !== undefined || updateFields.lng !== undefined) &&
      updateFields.timezone === undefined
    ) {
      const lat = updateFields.lat ?? existing.lat;
      const lng = updateFields.lng ?? existing.lng;
      updateFields.timezone = getTimezoneFromCoords(lat, lng);
    }

    const updated = await profileService.updateProfile(
      profileId,
      updateFields
    );
    return updated;
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error("updateProfile failed", { profileId: data.profileId, error: (error as Error).message });
    throw new HttpsError("internal", "An unexpected error occurred");
  }
});
