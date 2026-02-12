import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as profileService from "../services/profile";

export const deleteProfile = onCall(async (request) => {
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

  try {
    // Ownership check: fetch profile first
    const existing = await profileService.getProfileById(data.profileId);

    if (!existing) {
      throw new HttpsError("not-found", "Profile not found");
    }

    if (existing.ownerDeviceId !== data.ownerDeviceId) {
      throw new HttpsError("permission-denied", "Access denied");
    }

    await profileService.deleteProfile(data.profileId);
    return { success: true };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "An unexpected error occurred");
  }
});
