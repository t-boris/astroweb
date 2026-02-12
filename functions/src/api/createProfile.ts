import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { validateCreateProfilePayload } from "../validation/profile";
import * as profileService from "../services/profile";
import { getTimezoneFromCoords } from "../utils/timezone";

export const createProfile = onCall(async (request) => {
  const { data } = request;

  // Validate input
  const errors = validateCreateProfilePayload(data);
  if (errors.length > 0) {
    throw new HttpsError("invalid-argument", errors[0].message);
  }

  logger.info("createProfile called", { name: data?.name });

  try {
    // Auto-resolve timezone from coordinates if not provided
    if (!data.timezone) {
      data.timezone = getTimezoneFromCoords(data.lat, data.lng);
    }

    const profile = await profileService.createProfile(data);
    return profile;
  } catch (error) {
    logger.error("createProfile failed", { error: (error as Error).message });
    throw new HttpsError("internal", "An unexpected error occurred");
  }
});
