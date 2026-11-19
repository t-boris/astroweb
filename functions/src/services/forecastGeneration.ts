import { HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { computeNatalChart } from "../astro/chart";
import { resolveOwnedChart } from "./chartResolver";
import {
  buildOraclePrompt,
  buildPeriodHoroscopePrompt,
  buildRelationshipPrompt,
  type SupportedLanguage,
} from "./prompts";
import { runTask } from "./ai/run";
import { loadTaskSettings, textsFor } from "./ai/settings";
import { getTimezoneFromCoords } from "../utils/timezone";
import { getDossierSummaryText, recordOracleHistory } from "./dossier";
import { extractAndStoreFacts } from "./factExtraction";
import { saveCompatReading } from "./profileContent";
import { computePeriodTransits } from "./transits";
import { threeMonthPeriod, todayUtcIso, type PeriodHoroscopeType } from "./directServices";

export interface PartnerInput {
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

export function parsePartnerInput(raw: unknown): PartnerInput {
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

  return { name, birthDate, birthTime, timeUnknown, birthPlace, lat, lng };
}

export function parseSituationQuestion(raw: unknown): string {
  if (!raw || typeof raw !== "string") {
    throw new HttpsError("invalid-argument", "question is required");
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new HttpsError("invalid-argument", "question cannot be empty");
  }
  if (trimmed.length > 1000) {
    throw new HttpsError("invalid-argument", "question is too long");
  }
  return trimmed;
}

function residenceOf(
  profile: { lat: number; lng: number; timezone?: string; currentLat?: number | null; currentLng?: number | null; relocationEnabled?: boolean },
  relocationLat?: number | null,
  relocationLng?: number | null,
) {
  const lat =
    typeof relocationLat === "number" && Number.isFinite(relocationLat)
      ? relocationLat
      : profile.relocationEnabled && typeof profile.currentLat === "number"
        ? profile.currentLat
        : profile.lat;
  const lng =
    typeof relocationLng === "number" && Number.isFinite(relocationLng)
      ? relocationLng
      : profile.relocationEnabled && typeof profile.currentLng === "number"
        ? profile.currentLng
        : profile.lng;
  const timezone = profile.timezone || "UTC";
  return { lat, lng, timezone };
}

export interface SituationForecastResult {
  answer: string;
  model: string;
  entryId: string | null;
  persisted: boolean;
  periodStart: string;
  periodEnd: string;
}

/** Generate and persist a 3-month situation forecast (REQ-001, DEC-002). */
export async function generateSituationForecast(params: {
  profileId: string;
  uid: string;
  question: string;
  language: SupportedLanguage;
  relocationLat?: number | null;
  relocationLng?: number | null;
  periodStart?: string;
  periodEnd?: string;
  orderId?: string;
}): Promise<SituationForecastResult> {
  const { profileId, uid, question, language, relocationLat, relocationLng, orderId } = params;
  const { profile, chart } = await resolveOwnedChart({
    profileId,
    uid,
    relocationLat: relocationLat ?? undefined,
    relocationLng: relocationLng ?? undefined,
  });

  const period =
    params.periodStart && params.periodEnd
      ? { periodStart: params.periodStart, periodEnd: params.periodEnd }
      : threeMonthPeriod(todayUtcIso());

  let dossierSummary = "";
  try {
    dossierSummary = await getDossierSummaryText(profileId);
  } catch {
    /* dossier optional */
  }

  let transits = "none";
  try {
    transits = computePeriodTransits(
      chart,
      residenceOf(profile, relocationLat, relocationLng),
      period.periodStart,
      period.periodEnd,
      3,
    );
  } catch (e) {
    logger.warn("situation transits computation failed", { profileId, error: (e as Error).message });
  }

  const settings = await loadTaskSettings("oracle");
  const basePrompt = buildOraclePrompt({
    chart,
    question,
    language,
    dossierSummary,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    transits,
    texts: textsFor(settings, language),
  });

  const result = await runTask(settings, basePrompt);

  let entryId: string | null = null;
  try {
    entryId = await recordOracleHistory(profileId, {
      question,
      answer: result.text,
      model: result.model,
      channel: "web",
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      ...(orderId ? { orderId } : {}),
    });
  } catch (e) {
    logger.warn("situation forecast history write failed", { profileId, error: (e as Error).message });
  }
  try {
    await extractAndStoreFacts(profileId, uid, question, null);
  } catch (e) {
    logger.warn("situation forecast fact extraction failed", { profileId, error: (e as Error).message });
  }

  return {
    answer: result.text,
    model: result.model,
    entryId,
    persisted: entryId !== null,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
  };
}

export interface RelationshipForecastResult {
  answer: string;
  model: string;
  partnerTimezone: string;
  generatedAt: string;
  readingId: string | null;
  persisted: boolean;
  periodStart: string;
  periodEnd: string;
}

/** Generate and persist a 3-month relationship forecast (REQ-002, DEC-002). */
export async function generateRelationshipForecast(params: {
  profileId: string;
  uid: string;
  partner: PartnerInput;
  language: SupportedLanguage;
  relocationLat?: number | null;
  relocationLng?: number | null;
  periodStart?: string;
  periodEnd?: string;
  orderId?: string;
}): Promise<RelationshipForecastResult> {
  const { profileId, uid, partner, language, relocationLat, relocationLng, orderId } = params;
  const { profile, chart: chartA } = await resolveOwnedChart({
    profileId,
    uid,
    houseSystem: "koch",
    relocationLat: relocationLat ?? undefined,
    relocationLng: relocationLng ?? undefined,
  });

  const period =
    params.periodStart && params.periodEnd
      ? { periodStart: params.periodStart, periodEnd: params.periodEnd }
      : threeMonthPeriod(todayUtcIso());

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

  let transits = "none";
  try {
    transits = computePeriodTransits(
      chartA,
      residenceOf(profile, relocationLat, relocationLng),
      period.periodStart,
      period.periodEnd,
      3,
    );
  } catch (e) {
    logger.warn("relationship transits computation failed", { profileId, error: (e as Error).message });
  }

  const settings = await loadTaskSettings("compatibility");
  const result = await runTask(
    settings,
    buildRelationshipPrompt({
      chartA,
      chartB,
      personAName: profile.name,
      personBName: partner.name,
      language,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      transits,
      texts: textsFor(settings, language),
    }),
  );

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
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      ...(orderId ? { orderId } : {}),
    });
  } catch (e) {
    logger.warn("relationship forecast write failed", { profileId, error: (e as Error).message });
  }

  return {
    answer: result.text,
    model: result.model,
    partnerTimezone,
    generatedAt,
    readingId,
    persisted: readingId !== null,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
  };
}

export interface PeriodHoroscopeResult {
  text: string;
  model: string;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
}

/** Generate a calendar-month or calendar-year horoscope for confirmed period dates (REQ-003). */
export async function generatePeriodHoroscope(params: {
  profileId: string;
  uid: string;
  periodType: PeriodHoroscopeType;
  periodStart: string;
  periodEnd: string;
  language: SupportedLanguage;
  relocationLat?: number | null;
  relocationLng?: number | null;
}): Promise<PeriodHoroscopeResult> {
  const { profileId, uid, periodType, periodStart, periodEnd, language, relocationLat, relocationLng } = params;
  const { profile, chart } = await resolveOwnedChart({
    profileId,
    uid,
    relocationLat: relocationLat ?? undefined,
    relocationLng: relocationLng ?? undefined,
  });

  const today = todayUtcIso();
  const sampleCount = periodType === "year" ? 4 : 3;
  let transits = "none";
  try {
    transits = computePeriodTransits(
      chart,
      residenceOf(profile, relocationLat, relocationLng),
      periodStart,
      periodEnd,
      sampleCount,
    );
  } catch (e) {
    logger.warn("period horoscope transits computation failed", { profileId, periodType, error: (e as Error).message });
  }

  const taskId = periodType === "year" ? "yearlyHoroscope" : "monthlyHoroscope";
  const settings = await loadTaskSettings(taskId);
  const result = await runTask(
    settings,
    buildPeriodHoroscopePrompt({
      periodType,
      chart,
      periodStart,
      periodEnd,
      today,
      language,
      transits,
      texts: textsFor(settings, language),
    }),
  );

  return {
    text: result.text,
    model: result.model,
    generatedAt: new Date().toISOString(),
    periodStart,
    periodEnd,
  };
}
