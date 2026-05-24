import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { resolveOwnedChart } from "../services/chartResolver";
import {
  generateInterpretationPdf,
  type PremiumPdfNarrative,
  type PremiumPdfReport,
  type PremiumPdfSection,
} from "../services/pdf";
import {
  buildPremiumPdfNarrativeSectionPrompt,
  generateClaudeTextResult,
  normalizeLanguage,
  type PremiumPdfNarrativeSection,
} from "../services/anthropic";

interface RawPdfSection {
  title?: unknown;
  body?: unknown;
  category?: unknown;
  detail?: unknown;
}

const MAX_SECTIONS = 30;
const MAX_SECTION_BODY_LENGTH = 12000;
const MAX_TOTAL_BODY_LENGTH = 180000;

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

function parseSections(rawSections: unknown): PremiumPdfSection[] {
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

    return {
      title: requiredString(section.title, `report.sections[${index}].title`).slice(0, 220),
      body,
      category: optionalString(section.category, 120),
      detail: optionalString(section.detail, 500),
    };
  });

  if (totalBodyLength > MAX_TOTAL_BODY_LENGTH) {
    throw new HttpsError("invalid-argument", "PDF report is too large");
  }

  return sections;
}

function slugifyFileName(input: string): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9а-яА-ЯёЁ]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return slug || "astroweb-report";
}

function optionalCoordinate(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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

export const downloadPremiumPdf = onCall({
  timeoutSeconds: 300,
  secrets: ["ANTHROPIC_API_KEY"],
}, async (request) => {
  const profileId = requiredString(request.data?.profileId, "profileId");
  const ownerDeviceId = requiredString(request.data?.ownerDeviceId, "ownerDeviceId");
  const language = normalizeLanguage(request.data?.language);
  const relocationLat = optionalCoordinate(request.data?.relocationLat);
  const relocationLng = optionalCoordinate(request.data?.relocationLng);
  const isRelocated = relocationLat !== undefined && relocationLng !== undefined;

  const { profile, chart } = await resolveOwnedChart({
    profileId,
    ownerDeviceId,
    relocationLat,
    relocationLng,
  });

  if (!profile.hasPremiumPdf) {
    throw new HttpsError("permission-denied", "Premium PDF access is not active");
  }

  const rawReport = request.data?.report ?? {};
  const sections = parseSections(rawReport.sections);
  const generatedAt = optionalString(rawReport.generatedAt, 120);

  let aiNarrative: PremiumPdfNarrative;
  try {
    const sectionKeys: PremiumPdfNarrativeSection[] = [
      "planets",
      "houses",
      "aspects",
      "portrait",
    ];
    const sectionResults = await Promise.all(
      sectionKeys.map(async (section) => {
        try {
          const result = await generateClaudeTextResult(
            buildPremiumPdfNarrativeSectionPrompt({
              profile,
              chart,
              language,
              sections,
              section,
              isRelocated,
            }),
            {
              allowContinuation: true,
              sanitizeOutput: true,
              requireEndTag: "[END_OF_REPORT]",
            },
          );

          return {
            section,
            text: result.text,
            model: result.model,
          };
        } catch (error) {
          throw new Error(`AI section "${section}" failed: ${(error as Error).message}`);
        }
      }),
    );

    aiNarrative = sectionResults.reduce<PremiumPdfNarrative>(
      (accumulator, result) => ({
        ...accumulator,
        [result.section]: result.text,
      }),
      {
        model: Array.from(new Set(sectionResults.map((result) => result.model))).join(", "),
      },
    );
    requireCompleteAiNarrative(aiNarrative);

    logger.info("downloadPremiumPdf AI narrative generated", {
      profileId,
      language,
      model: aiNarrative.model,
      planetsLength: aiNarrative.planets?.length ?? 0,
      housesLength: aiNarrative.houses?.length ?? 0,
      aspectsLength: aiNarrative.aspects?.length ?? 0,
      portraitLength: aiNarrative.portrait?.length ?? 0,
    });
  } catch (error) {
    logger.error("downloadPremiumPdf AI narrative failed", {
      profileId,
      language,
      error: (error as Error).message,
    });
    throw new HttpsError("internal", "Failed to generate premium PDF text");
  }

  const report: PremiumPdfReport = {
    language,
    title:
      optionalString(rawReport.title, 180) ??
      (language === "ru"
        ? `Премиум-интерпретация: ${profile.name}`
        : `Premium Interpretation: ${profile.name}`),
    subtitle:
      optionalString(rawReport.subtitle, 240) ??
      (language === "ru"
        ? `Подготовлено для ${profile.name}`
        : `Prepared for ${profile.name}`),
    generatedAt,
    sections,
    aiNarrative,
    profile,
    chart,
    isRelocated,
  };

  try {
    const pdfBuffer = await generateInterpretationPdf(report);

    return {
      fileName: `${slugifyFileName(profile.name)}-astroweb-premium.pdf`,
      contentType: "application/pdf",
      base64: pdfBuffer.toString("base64"),
      byteLength: pdfBuffer.byteLength,
    };
  } catch (error) {
    logger.error("downloadPremiumPdf failed", {
      profileId,
      error: (error as Error).message,
    });
    throw new HttpsError("internal", "Failed to generate premium PDF");
  }
});
