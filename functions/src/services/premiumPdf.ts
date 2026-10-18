import { createHash } from "node:crypto";
import { HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { getStorage } from "firebase-admin/storage";
import type { ChartResult, Profile } from "../types";
import {
  generateInterpretationPdf,
  type PremiumPdfNarrative,
  type PremiumPdfReport,
  type PremiumPdfSection,
} from "./pdf";
import {
  buildPremiumPdfNarrativeSectionPrompt,
  type PremiumPdfNarrativeSection,
  promptLanguage,
  type SupportedLanguage,
} from "./prompts";
import { runTask, settingsKeyPart } from "./ai/run";
import { loadTaskSettings, textsFor, type EffectiveTaskSettings } from "./ai/settings";

const MAX_SECTIONS = 30;
const MAX_SECTION_BODY_LENGTH = 12000;
const MAX_TOTAL_BODY_LENGTH = 180000;

// Bump to invalidate cached PDFs when the prompt or renderer output changes.
// 2 = fix trailing blank pages (footer overflow) + 8000-token sections.
const PREMIUM_PDF_RENDERER_VERSION = "2";

/**
 * Dedicated Cloud Storage bucket for rendered premium PDFs (admin-only access).
 * Name is derived from the project id so it works across environments.
 */
export function premiumPdfBucket() {
  const project =
    process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "astroweb-dev";
  return getStorage().bucket(`${project}-premium-pdfs`);
}

/**
 * Deterministic cache key over every input that affects the generated PDF.
 * Identical inputs → identical key → reuse the already-rendered file instead of
 * paying for the Claude narrative + render again.
 */
export function computePremiumPdfCacheKey(params: {
  profile: Profile;
  language: SupportedLanguage;
  relocationLat?: number;
  relocationLng?: number;
  sections: PremiumPdfSection[];
  /** Settings of the premiumPdf task: a changed model or prompt gets a new key (DEC-004). */
  settings: EffectiveTaskSettings;
}): string {
  const { profile, language, relocationLat, relocationLng, sections } = params;
  const canonical = JSON.stringify({
    // Bump when the prompt or PDF renderer changes, to invalidate old cache entries.
    rendererVersion: PREMIUM_PDF_RENDERER_VERSION,
    profileId: profile.id,
    birthDate: profile.birthDate,
    birthTime: profile.birthTime ?? null,
    timeUnknown: profile.timeUnknown,
    lat: profile.lat,
    lng: profile.lng,
    timezone: profile.timezone,
    relocationLat: relocationLat ?? null,
    relocationLng: relocationLng ?? null,
    language,
    sections: sections.map((section) => ({
      title: section.title,
      body: section.body,
      category: section.category ?? null,
      detail: section.detail ?? null,
    })),
    ...settingsKeyPart(params.settings),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/** Stable storage path for a cached PDF (shared across jobs with the same key). */
export function premiumPdfCacheStoragePath(cacheKey: string): string {
  return `premium-pdfs/cache/${cacheKey}.pdf`;
}

interface RawPdfSection {
  title?: unknown;
  body?: unknown;
  category?: unknown;
  detail?: unknown;
}

function requiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpsError("invalid-argument", `${fieldName} is required`);
  }

  return value.trim();
}

function optionalString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

/**
 * Validate and clamp the report sections supplied by the client.
 * Throws HttpsError("invalid-argument") on malformed input so the enqueue
 * callable surfaces a clear validation error.
 */
export function parsePremiumPdfSections(rawSections: unknown): PremiumPdfSection[] {
  if (!Array.isArray(rawSections) || rawSections.length === 0) {
    throw new HttpsError("invalid-argument", "report.sections is required");
  }

  if (rawSections.length > MAX_SECTIONS) {
    throw new HttpsError("invalid-argument", "Too many PDF sections");
  }

  let totalBodyLength = 0;

  const sections = rawSections.map((raw, index) => {
    const section = raw as RawPdfSection;
    const body = requiredString(section.body, `report.sections[${index}].body`)
      .slice(0, MAX_SECTION_BODY_LENGTH);
    totalBodyLength += body.length;

    // Omit optional keys when absent — Firestore rejects `undefined` values.
    const parsed: PremiumPdfSection = {
      title: requiredString(section.title, `report.sections[${index}].title`).slice(0, 220),
      body,
    };
    const category = optionalString(section.category, 120);
    if (category !== undefined) parsed.category = category;
    const detail = optionalString(section.detail, 500);
    if (detail !== undefined) parsed.detail = detail;
    return parsed;
  });

  if (totalBodyLength > MAX_TOTAL_BODY_LENGTH) {
    throw new HttpsError("invalid-argument", "PDF report is too large");
  }

  return sections;
}

export function slugifyPremiumPdfFileName(input: string): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9Ѐ-ӿ]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return slug || "astroweb-report";
}

function requireCompleteAiNarrative(narrative: PremiumPdfNarrative): void {
  const missing = [
    ["planets", narrative.planets],
    ["houses", narrative.houses],
    ["aspects", narrative.aspects],
    ["portrait", narrative.portrait],
  ]
    .filter(([, value]) => typeof value !== "string" || value.trim().length < 120)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Premium PDF AI narrative is incomplete: ${missing.join(", ")}`);
  }
}

/**
 * Generate the four AI narrative sections of the premium PDF in parallel with
 * the premiumPdf task's settings, and check that none came back empty.
 */
export async function generatePremiumPdfNarrative(params: {
  profile: Profile;
  chart: ChartResult;
  language: SupportedLanguage;
  sections: PremiumPdfSection[];
  isRelocated: boolean;
  settings: EffectiveTaskSettings;
}): Promise<PremiumPdfNarrative> {
  const { profile, chart, language, sections, isRelocated, settings } = params;
  const sectionKeys: PremiumPdfNarrativeSection[] = [
    "planets",
    "houses",
    "aspects",
    "portrait",
  ];

  const sectionResults = await Promise.all(
    sectionKeys.map(async (section) => {
      try {
        const result = await runTask(
          settings,
          buildPremiumPdfNarrativeSectionPrompt({
            profile,
            chart,
            language,
            sections,
            section,
            isRelocated,
            texts: textsFor(settings, language),
          }),
        );

        return { section, text: result.text, model: result.model };
      } catch (error) {
        throw new Error(`AI section "${section}" failed: ${(error as Error).message}`);
      }
    }),
  );

  const aiNarrative = sectionResults.reduce<PremiumPdfNarrative>(
    (accumulator, result) => ({
      ...accumulator,
      [result.section]: result.text,
    }),
    {
      model: Array.from(new Set(sectionResults.map((result) => result.model))).join(", "),
    },
  );
  requireCompleteAiNarrative(aiNarrative);
  return aiNarrative;
}

/**
 * Generate the full premium PDF: four AI narrative sections in parallel, then render.
 * Pure server-side work — safe to run inside the async job worker (no request deadline).
 */
export async function generatePremiumPdfArtifact(params: {
  profile: Profile;
  chart: ChartResult;
  language: SupportedLanguage;
  sections: PremiumPdfSection[];
  isRelocated: boolean;
  /** Settings of the premiumPdf task; loaded when not given. */
  settings?: EffectiveTaskSettings;
  title?: string;
  subtitle?: string;
  generatedAt?: string;
}): Promise<{ buffer: Buffer; fileName: string }> {
  const { profile, chart, language, sections, isRelocated } = params;
  const settings = params.settings ?? (await loadTaskSettings("premiumPdf"));
  const aiNarrative = await generatePremiumPdfNarrative({ profile, chart, language, sections, isRelocated, settings });

  logger.info("premium PDF AI narrative generated", {
    profileId: profile.id,
    language,
    model: aiNarrative.model,
    planetsLength: aiNarrative.planets?.length ?? 0,
    housesLength: aiNarrative.houses?.length ?? 0,
    aspectsLength: aiNarrative.aspects?.length ?? 0,
    portraitLength: aiNarrative.portrait?.length ?? 0,
  });

  const report: PremiumPdfReport = {
    // Static PDF labels exist only in ru/en; AI narrative is already in the requested language.
    language: promptLanguage(language),
    title:
      params.title ??
      (language === "ru"
        ? `Премиум-интерпретация: ${profile.name}`
        : `Premium Interpretation: ${profile.name}`),
    subtitle:
      params.subtitle ??
      (language === "ru"
        ? `Подготовлено для ${profile.name}`
        : `Prepared for ${profile.name}`),
    generatedAt: params.generatedAt,
    sections,
    aiNarrative,
    profile,
    chart,
    isRelocated,
  };

  const buffer = await generateInterpretationPdf(report);

  return {
    buffer,
    fileName: `${slugifyPremiumPdfFileName(profile.name)}-astroweb-premium.pdf`,
  };
}
