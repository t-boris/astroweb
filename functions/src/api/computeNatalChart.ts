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
  const houseSystem = data?.houseSystem ?? "koch";
  const relocationLat = data?.relocationLat ?? undefined;
  const relocationLng = data?.relocationLng ?? undefined;

  if (!profileId || typeof profileId !== "string") {
    throw new HttpsError("invalid-argument", "profileId is required");
  }

  if (!ownerDeviceId || typeof ownerDeviceId !== "string") {
    throw new HttpsError("invalid-argument", "ownerDeviceId is required");
  }

  if (
    houseSystem !== "placidus" &&
    houseSystem !== "koch" &&
    houseSystem !== "whole-sign"
  ) {
    throw new HttpsError("invalid-argument", "Invalid house system");
  }

  const relocationLatValid =
    typeof relocationLat === "number" &&
    !Number.isNaN(relocationLat) &&
    relocationLat >= -90 &&
    relocationLat <= 90;
  const relocationLngValid =
    typeof relocationLng === "number" &&
    !Number.isNaN(relocationLng) &&
    relocationLng >= -180 &&
    relocationLng <= 180;
  const relocationProvided = relocationLatValid && relocationLngValid;

  if (
    (relocationLat !== undefined || relocationLng !== undefined) &&
    !relocationProvided
  ) {
    logger.warn("computeNatalChart invalid relocation fallback to natal", {
      profileId,
      relocationLat,
      relocationLng,
    });
  }

  logger.info("computeNatalChart called", {
    profileId,
    houseSystem,
    relocation: relocationProvided,
  });

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
    const chartLat = relocationProvided ? relocationLat : profile.lat;
    const chartLng = relocationProvided ? relocationLng : profile.lng;

    const inputHash = chartService.computeInputHash({
      birthDate: profile.birthDate,
      birthTime: profile.birthTime,
      lat: chartLat,
      lng: chartLng,
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
      lat: chartLat,
      lng: chartLng,
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
