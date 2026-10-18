import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { computeNatalChart } from "../astro/chart";
import { resolveOwnedChart } from "../services/chartResolver";
import { buildRelationshipPrompt, normalizeLanguage } from "../services/prompts";
import { AI_SECRETS } from "../services/ai/keys";
import { runTask } from "../services/ai/run";
import { loadTaskSettings, textsFor } from "../services/ai/settings";
import { getTimezoneFromCoords } from "../utils/timezone";
import { TOKEN_COST } from "../services/tokens";
import { spendFromWallet, refundToWallet } from "../services/wallet";
import { requireAccount } from "../services/owner";
import { saveCompatReading } from "../services/profileContent";

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

export const askRelationship = onCall({
  timeoutSeconds: 180,
  secrets: AI_SECRETS,
}, async (request) => {
  // A compatibility reading costs stars: account only (DEC-001, REQ-006).
  const uid = requireAccount(request);
  const profileId = request.data?.profileId;
  const language = normalizeLanguage(request.data?.language);
  const relocationLat = request.data?.relocationLat;
  const relocationLng = request.data?.relocationLng;
  const partner = parsePartnerInput(request.data?.partner);

  if (!profileId || typeof profileId !== "string") {
    throw new HttpsError("invalid-argument", "profileId is required");
  }

  const { profile, chart: chartA } = await resolveOwnedChart({
    profileId,
    uid,
    houseSystem: "koch",
    relocationLat,
    relocationLng,
  });

  // Each compatibility reading costs ✦2 (a fresh paid reading per partner),
  // mirroring the oracle's per-question charge. Spend up front from the user's
  // wallet; refund on failure so the user is never charged for a reading they
  // didn't receive.
  const walletKey = uid;
  await spendFromWallet(walletKey, TOKEN_COST.compatibility, "relationship");

  try {
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

    const settings = await loadTaskSettings("compatibility");
    const result = await runTask(
      settings,
      buildRelationshipPrompt({
        chartA,
        chartB,
        personAName: profile.name,
        personBName: partner.name,
        language,
        texts: textsFor(settings, language),
      }),
    );

    logger.info("askRelationship success", {
      profileId,
      partnerName: partner.name,
      answerLength: result.text.length,
    });

    // REQ-002: the paid reading is stored on the server for every device of
    // the account. A failed write does not cost the user the reading: the
    // client keeps it locally (persisted=false) and uploads it later.
    const generatedAt = new Date().toISOString();
    let readingId: string | null = null;
    try {
      readingId = await saveCompatReading(profileId, {
        partnerName: partner.name,
        partnerBirthDate: partner.birthDate,
        partnerBirthPlace: partner.birthPlace,
        answer: result.text,
        partnerTimezone,
        generatedAt,
        model: result.model,
      });
    } catch (e) {
      logger.warn("askRelationship reading write failed", { profileId, error: (e as Error).message });
    }

    return {
      answer: result.text,
      model: result.model,
      partnerTimezone,
      generatedAt,
      readingId,
      persisted: readingId !== null,
    };
  } catch (error) {
    // Generation failed after tokens were spent — refund (best-effort).
    try {
      await refundToWallet(walletKey, TOKEN_COST.compatibility, "relationship");
      logger.info("askRelationship refunded tokens after failure", { profileId });
    } catch (refundError) {
      logger.error("askRelationship failed to refund tokens", {
        profileId,
        error: (refundError as Error).message,
      });
    }

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
