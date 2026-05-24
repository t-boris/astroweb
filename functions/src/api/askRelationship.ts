import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { computeNatalChart } from "../astro/chart";
import { resolveOwnedChart } from "../services/chartResolver";
import {
  buildRelationshipPrompt,
  generateClaudeTextResult,
  normalizeLanguage,
} from "../services/anthropic";
import { getTimezoneFromCoords } from "../utils/timezone";

interface PartnerInput {
  name: string;
  birthDate: string;
  birthTime: string | null;
  timeUnknown: boolean;
  birthPlace: string;
  lat: number;
  lng: number;
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function parsePartnerInput(raw: unknown): PartnerInput {
  if (!raw || typeof raw !== "object") {
    throw new HttpsError("invalid-argument", "partner is required");
  }

  const partner = raw as Record<string, unknown>;

  const name = typeof partner.name === "string" ? partner.name.trim() : "";
  if (!name || name.length > 100) {
    throw new HttpsError("invalid-argument", "partner.name is invalid");
  }

  const birthDate = typeof partner.birthDate === "string" ? partner.birthDate.trim() : "";
  if (!isValidDate(birthDate)) {
    throw new HttpsError("invalid-argument", "partner.birthDate is invalid");
  }

  const timeUnknown = Boolean(partner.timeUnknown);
  const rawTime = typeof partner.birthTime === "string" ? partner.birthTime.trim() : null;
  const birthTime = timeUnknown ? null : rawTime;
  if (!timeUnknown && (!birthTime || !isValidTime(birthTime))) {
    throw new HttpsError("invalid-argument", "partner.birthTime is invalid");
  }

  const birthPlace = typeof partner.birthPlace === "string" ? partner.birthPlace.trim() : "";
  if (!birthPlace || birthPlace.length > 200) {
    throw new HttpsError("invalid-argument", "partner.birthPlace is invalid");
  }

  const lat = typeof partner.lat === "number" ? partner.lat : Number.NaN;
  const lng = typeof partner.lng === "number" ? partner.lng : Number.NaN;
  if (Number.isNaN(lat) || lat < -90 || lat > 90) {
    throw new HttpsError("invalid-argument", "partner.lat is invalid");
  }
  if (Number.isNaN(lng) || lng < -180 || lng > 180) {
    throw new HttpsError("invalid-argument", "partner.lng is invalid");
  }

  return {
    name,
    birthDate,
    birthTime,
    timeUnknown,
    birthPlace,
    lat,
    lng,
  };
}

export const askRelationship = onCall({ timeoutSeconds: 180 }, async (request) => {
  const profileId = request.data?.profileId;
  const ownerDeviceId = request.data?.ownerDeviceId;
  const language = normalizeLanguage(request.data?.language);
  const relocationLat = request.data?.relocationLat;
  const relocationLng = request.data?.relocationLng;
  const partner = parsePartnerInput(request.data?.partner);

  if (!profileId || typeof profileId !== "string") {
    throw new HttpsError("invalid-argument", "profileId is required");
  }

  if (!ownerDeviceId || typeof ownerDeviceId !== "string") {
    throw new HttpsError("invalid-argument", "ownerDeviceId is required");
  }

  try {
    const { profile, chart: chartA } = await resolveOwnedChart({
      profileId,
      ownerDeviceId,
      houseSystem: "koch",
      relocationLat,
      relocationLng,
    });

    const partnerTimezone = getTimezoneFromCoords(partner.lat, partner.lng);
    const chartB = computeNatalChart({
      birthDate: partner.birthDate,
      birthTime: partner.birthTime,
      timeUnknown: partner.timeUnknown,
      lat: partner.lat,
      lng: partner.lng,
      timezone: partnerTimezone,
      houseSystem: "koch",
    });

    const result = await generateClaudeTextResult(
      buildRelationshipPrompt({
        chartA,
        chartB,
        personAName: profile.name,
        personBName: partner.name,
        language,
      }),
      {
        allowContinuation: true,
        sanitizeOutput: true,
        requireEndTag: "[END_OF_REPORT]",
      },
    );

    logger.info("askRelationship success", {
      profileId,
      partnerName: partner.name,
      answerLength: result.text.length,
    });

    return {
      answer: result.text,
      model: result.model,
      partnerTimezone,
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }

    logger.error("askRelationship failed", {
      profileId,
      error: (error as Error).message,
    });
    throw new HttpsError("internal", "Failed to generate relationship reading");
  }
});
