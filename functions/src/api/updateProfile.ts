import { onCall, HttpsError } from "firebase-functions/v2/https";
import { validateUpdateProfilePayload } from "../validation/profile";
import * as profileService from "../services/profile";

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

    const updated = await profileService.updateProfile(
      profileId,
      updateFields
    );
    return updated;
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "An unexpected error occurred");
  }
});
