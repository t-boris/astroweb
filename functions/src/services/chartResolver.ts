import { HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { computeNatalChart } from "../astro/chart";
import type { ChartResult, Profile } from "../types";
import * as profileService from "./profile";
import * as chartService from "./chart";

export async function resolveOwnedChart(params: {
  profileId: string;
  ownerDeviceId: string;
  houseSystem?: "placidus" | "koch" | "whole-sign";
  relocationLat?: number | null;
  relocationLng?: number | null;
}): Promise<{ profile: Profile; chart: ChartResult }> {
  const houseSystem = params.houseSystem ?? "koch";

  if (
    houseSystem !== "placidus" &&
    houseSystem !== "koch" &&
    houseSystem !== "whole-sign"
  ) {
    throw new HttpsError("invalid-argument", "Invalid house system");
  }

  const relocationLat = params.relocationLat ?? undefined;
  const relocationLng = params.relocationLng ?? undefined;
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

  let chartLat = 0;
  let chartLng = 0;

  if (relocationProvided) {
    chartLat = relocationLat;
    chartLng = relocationLng;
  } else if (relocationLat !== undefined || relocationLng !== undefined) {
    logger.warn("resolveOwnedChart invalid relocation fallback to natal", {
      profileId: params.profileId,
      relocationLat,
      relocationLng,
    });
  }

  const profile = await profileService.getProfileById(params.profileId);
  if (!profile) {
    throw new HttpsError("not-found", "Profile not found");
  }

  if (profile.ownerDeviceId !== params.ownerDeviceId) {
    throw new HttpsError("permission-denied", "Access denied");
  }

  if (!relocationProvided) {
    chartLat = profile.lat;
    chartLng = profile.lng;
  }

  const inputHash = chartService.computeInputHash({
    birthDate: profile.birthDate,
    birthTime: profile.birthTime,
    lat: chartLat,
    lng: chartLng,
    timezone: profile.timezone,
    houseSystem,
  });

  const cached = await chartService.findCachedChart(params.profileId, inputHash);
  if (cached) {
    return {
      profile,
      chart: cached.result,
    };
  }

  const chart = computeNatalChart({
    birthDate: profile.birthDate,
    birthTime: profile.birthTime,
    timeUnknown: profile.timeUnknown,
    lat: chartLat,
    lng: chartLng,
    timezone: profile.timezone,
    houseSystem,
  });

  await chartService.storeChart(params.profileId, inputHash, chart);

  return {
    profile,
    chart,
  };
}
