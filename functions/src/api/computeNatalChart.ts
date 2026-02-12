import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { computeNatalChart as computeChart } from "../astro/chart";
import * as profileService from "../services/profile";
import * as chartService from "../services/chart";

/**
 * computeNatalChart Cloud Function — computes a natal chart for a profile.
 *
 * Validates input, enforces deviceId ownership, checks cache, computes
 * chart via astro/chart.ts, stores result in Firestore, and returns
 * the ChartResult.
 */
export const computeNatalChart = onCall(async (request) => {
  const { data } = request;

  // ---- Validate input ----
  const profileId = data?.profileId;
  const ownerDeviceId = data?.ownerDeviceId;
  const houseSystem = data?.houseSystem ?? "placidus";

  if (!profileId || typeof profileId !== "string") {
    throw new HttpsError("invalid-argument", "profileId is required");
  }

  if (!ownerDeviceId || typeof ownerDeviceId !== "string") {
    throw new HttpsError("invalid-argument", "ownerDeviceId is required");
  }

  if (houseSystem !== "placidus" && houseSystem !== "whole-sign") {
    throw new HttpsError("invalid-argument", "Invalid house system");
  }

  logger.info("computeNatalChart called", { profileId, houseSystem });

  try {
    // ---- Ownership check ----
    const profile = await profileService.getProfileById(profileId);

    if (!profile) {
      throw new HttpsError("not-found", "Profile not found");
    }

    if (profile.ownerDeviceId !== ownerDeviceId) {
      throw new HttpsError("permission-denied", "Access denied");
    }

    // ---- Cache check ----
    const inputHash = chartService.computeInputHash({
      birthDate: profile.birthDate,
      birthTime: profile.birthTime,
      lat: profile.lat,
      lng: profile.lng,
      timezone: profile.timezone,
      houseSystem,
    });

    const cached = await chartService.findCachedChart(profileId, inputHash);
    if (cached) {
      logger.info("computeNatalChart cache hit", { profileId, cached: true });
      return cached.result;
    }

    // ---- Compute ----
    const result = computeChart({
      birthDate: profile.birthDate,
      birthTime: profile.birthTime,
      timeUnknown: profile.timeUnknown,
      lat: profile.lat,
      lng: profile.lng,
      timezone: profile.timezone,
      houseSystem,
    });

    // ---- Store ----
    await chartService.storeChart(profileId, inputHash, result);

    // ---- Return ----
    return result;
  } catch (error) {
    // Re-throw HttpsError as-is
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error("computeNatalChart failed", { profileId, error: (error as Error).message });
    throw new HttpsError("internal", "Failed to compute chart");
  }
});
