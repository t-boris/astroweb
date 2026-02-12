import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { computeNatalChart } from "../astro/chart";
import * as profileService from "../services/profile";
import * as chartService from "../services/chart";

/**
 * getChart Cloud Function — cache-through chart retrieval.
 *
 * Validates input, enforces deviceId ownership, checks cache first.
 * If cache hit: returns { cached: true, chart: ChartResult }.
 * If cache miss: computes chart, stores in cache, returns { cached: false, chart: ChartResult }.
 *
 * The cached boolean lets the client know whether this was a fresh computation.
 */
export const getChart = onCall(async (request) => {
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
    logger.warn("getChart invalid relocation fallback to natal", {
      profileId,
      relocationLat,
      relocationLng,
    });
  }

  logger.info("getChart called", {
    profileId,
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

    // ---- Cache-through pattern ----
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

    // 1. Check cache
    const cached = await chartService.findCachedChart(profileId, inputHash);
    if (cached) {
      logger.info("getChart result", { profileId, cached: true });
      return { cached: true, chart: cached.result };
    }

    // 2. Cache miss — compute chart
    const result = computeNatalChart({
      birthDate: profile.birthDate,
      birthTime: profile.birthTime,
      timeUnknown: profile.timeUnknown,
      lat: chartLat,
      lng: chartLng,
      timezone: profile.timezone,
      houseSystem,
    });

    // 3. Store in cache
    await chartService.storeChart(profileId, inputHash, result);

    // 4. Return with cached: false
    logger.info("getChart result", { profileId, cached: false });
    return { cached: false, chart: result };
  } catch (error) {
    // Re-throw HttpsError as-is
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error("getChart failed", { profileId, error: (error as Error).message });
    throw new HttpsError("internal", "Failed to compute chart");
  }
});
