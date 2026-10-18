import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { assertAdmin } from "../services/adminAuth";
import { resolveOwnedChart } from "../services/chartResolver";
import { getProfileById } from "../services/profile";
import { getDossierSummaryText } from "../services/dossier";
import { loadLetterContext, prepareLetterInputs, runLetterAnalysis } from "../services/letterEngine";
import {
  buildDeepInterpretationPrompt,
  buildFactExtractionPrompt,
  buildForecastPrompt,
  buildLetterAnalysisPrompt,
  buildLetterGenerationPrompt,
  buildNewsDigestPrompt,
  buildOraclePrompt,
  buildPremiumPdfNarrativeSectionPrompt,
  buildRelationshipPrompt,
  normalizeLanguage,
  type PremiumPdfNarrativeSection,
  type SupportedLanguage,
} from "../services/prompts";
import type { GenerationPrompt } from "../services/ai/generate";
import { AI_SECRETS, providerConfigured } from "../services/ai/keys";
import { ADMIN_MAX_OUTPUT_TOKENS, ADMIN_MIN_OUTPUT_TOKENS, AI_MODELS, priceOn, type AiProvider } from "../services/ai/models";
import { runTask } from "../services/ai/run";
import {
  ALL_TASK_IDS,
  loadTaskSettings,
  MAX_PROMPT_LENGTH,
  mergeTaskSettings,
  minimalOverride,
  readStoredTaskSettings,
  resetTaskOverride,
  saveTaskOverride,
  textsFor,
  validateOverride,
  type EffectiveTaskSettings,
  type StoredTaskSettings,
  type TaskOverride,
} from "../services/ai/settings";
import { AI_TASKS, isAiTaskId, taskSpec, type AiTaskId, type TextLanguage } from "../services/ai/tasks";

/**
 * Admin AI settings (REQ-001..005, REQ-009): which model each AI task uses, its
 * limits and prompts, and a test run of unsaved settings. Every callable runs
 * the admin check first; prompts and settings are returned to the admin only.
 * The provider keys are bound only to tell whether each provider is configured;
 * no key value ever leaves the server (REQ-012).
 */

const PROVIDERS: AiProvider[] = ["anthropic", "openai", "gemini"];
const PDF_SECTIONS: PremiumPdfNarrativeSection[] = ["planets", "houses", "aspects", "portrait"];

function requireTaskId(value: unknown): AiTaskId {
  if (!isAiTaskId(value)) throw new HttpsError("invalid-argument", "Unknown AI task");
  return value;
}

/** Keep only the known fields of an override sent by the client, with their expected types. */
function parseOverride(raw: unknown): TaskOverride {
  if (!raw || typeof raw !== "object") return {};
  const input = raw as Record<string, unknown>;
  const override: TaskOverride = {};
  if (typeof input.model === "string") override.model = input.model;
  if (input.maxOutputTokens !== undefined) override.maxOutputTokens = input.maxOutputTokens as number;
  if (input.temperature !== undefined) override.temperature = input.temperature as number | null;
  if (input.texts && typeof input.texts === "object") {
    const texts: NonNullable<TaskOverride["texts"]> = {};
    for (const [language, parts] of Object.entries(input.texts as Record<string, unknown>)) {
      if (!parts || typeof parts !== "object") continue;
      const clean: Record<string, string> = {};
      for (const [key, text] of Object.entries(parts as Record<string, unknown>)) {
        clean[key] = typeof text === "string" ? text : "";
      }
      texts[language as TextLanguage] = clean;
    }
    override.texts = texts;
  }
  return override;
}

function requireValid(taskId: AiTaskId, override: TaskOverride): void {
  const problems = validateOverride(taskId, override, { requireProviderKey: true });
  if (problems.length) {
    throw new HttpsError("invalid-argument", problems.join("\n"), { problems });
  }
}

function taskView(taskId: AiTaskId, stored: StoredTaskSettings | null) {
  const task = taskSpec(taskId);
  const effective = mergeTaskSettings(taskId, stored);
  const override = stored ? minimalOverride(taskId, stored) : {};
  return {
    id: task.id,
    label: task.label,
    description: task.description,
    languages: task.languages,
    parts: task.parts,
    testInputs: task.testInputs,
    needsWebSearch: Boolean(task.generation.webSearch),
    defaults: task.defaults,
    override,
    effective: {
      model: effective.model,
      maxOutputTokens: effective.maxOutputTokens,
      temperature: effective.temperature,
      texts: effective.texts,
      version: effective.version,
    },
    updatedAt: stored?.updatedAt ?? null,
    updatedBy: stored?.updatedBy ?? null,
  };
}

function modelsView() {
  const today = new Date();
  return AI_MODELS.map((model) => {
    const price = priceOn(model, today);
    const next = model.prices.find((p) => p.from > today.toISOString().slice(0, 10));
    return {
      id: model.id,
      provider: model.provider,
      label: model.label,
      inputPerMTok: price.inputPerMTok,
      outputPerMTok: price.outputPerMTok,
      nextPrice: next ?? null,
      maxOutputTokens: Math.min(ADMIN_MAX_OUTPUT_TOKENS, model.maxOutputTokens),
      temperature: model.temperature,
      webSearch: model.webSearch,
      available: providerConfigured(model.provider),
    };
  });
}

export const adminGetAiSettings = onCall({ secrets: AI_SECRETS }, async (request) => {
  assertAdmin(request);
  // Read the store directly (not the 60 s cache), so the admin sees what is saved.
  const stored = await Promise.all(ALL_TASK_IDS.map((id) => readStoredTaskSettings(id)));
  return {
    providers: Object.fromEntries(PROVIDERS.map((p) => [p, providerConfigured(p)])),
    models: modelsView(),
    limits: {
      minOutputTokens: ADMIN_MIN_OUTPUT_TOKENS,
      maxOutputTokens: ADMIN_MAX_OUTPUT_TOKENS,
      maxPromptLength: MAX_PROMPT_LENGTH,
    },
    tasks: AI_TASKS.map((task, index) => taskView(task.id, stored[index])),
  };
});

export const adminSaveAiSettings = onCall({ secrets: AI_SECRETS }, async (request) => {
  const admin = assertAdmin(request);
  const taskId = requireTaskId(request.data?.taskId);
  const override = parseOverride(request.data?.override);
  requireValid(taskId, override);
  await saveTaskOverride(taskId, override, admin);
  logger.info("AI settings saved", { taskId, by: admin });
  return { task: taskView(taskId, await readStoredTaskSettings(taskId)) };
});

export const adminResetAiSettings = onCall({ secrets: AI_SECRETS }, async (request) => {
  const admin = assertAdmin(request);
  const taskId = requireTaskId(request.data?.taskId);
  await resetTaskOverride(taskId);
  logger.info("AI settings reset to defaults", { taskId, by: admin });
  return { task: taskView(taskId, null) };
});

// ---- Test run (REQ-009) ---------------------------------------------------------

interface TestInputs {
  question?: string;
  topic?: string;
  baseInterpretation?: string;
  partnerProfileId?: string;
  section?: string;
}

function requiredInput(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) throw new HttpsError("invalid-argument", `${name} is required`);
  return value.trim().slice(0, maxLength);
}

async function chartOf(profileId: string) {
  const profile = await getProfileById(profileId);
  if (!profile) throw new HttpsError("not-found", "Profile not found");
  return resolveOwnedChart({ profileId, ownerDeviceId: profile.ownerDeviceId, uid: profile.ownerUid ?? null });
}

/**
 * Build the prompt a task would send for this profile, from read-only data:
 * nothing is charged, cached or written to the person's content.
 */
async function testPrompt(
  settings: EffectiveTaskSettings,
  profileId: string,
  language: SupportedLanguage,
  inputs: TestInputs,
): Promise<GenerationPrompt> {
  const texts = textsFor(settings, language);
  switch (settings.taskId) {
    case "oracle":
    case "oracleLetter": {
      const { chart } = await chartOf(profileId);
      const dossierSummary = await getDossierSummaryText(profileId).catch(() => "");
      const question = requiredInput(inputs.question, "question", 1000);
      return buildOraclePrompt({ chart, question, language, dossierSummary, taskId: settings.taskId, texts });
    }
    case "compatibility": {
      const partnerProfileId = requiredInput(inputs.partnerProfileId, "partnerProfileId", 200);
      const [a, b] = await Promise.all([chartOf(profileId), chartOf(partnerProfileId)]);
      return buildRelationshipPrompt({
        chartA: a.chart,
        chartB: b.chart,
        personAName: a.profile.name,
        personBName: b.profile.name,
        language,
        texts,
      });
    }
    case "deepen": {
      const { chart } = await chartOf(profileId);
      return buildDeepInterpretationPrompt({
        chart,
        focusTopic: requiredInput(inputs.topic, "topic", 200),
        baseInterpretation: requiredInput(inputs.baseInterpretation, "baseInterpretation", 2000),
        language,
        texts,
      });
    }
    case "forecast": {
      const { chart } = await chartOf(profileId);
      return buildForecastPrompt({ chart, today: new Date().toISOString().slice(0, 10), language, texts });
    }
    case "premiumPdf": {
      const section = inputs.section as PremiumPdfNarrativeSection;
      if (!PDF_SECTIONS.includes(section)) throw new HttpsError("invalid-argument", "section is required");
      const { profile, chart } = await chartOf(profileId);
      return buildPremiumPdfNarrativeSectionPrompt({ profile, chart, language, sections: [], section, isRelocated: false, texts });
    }
    case "letterAnalysis": {
      const letterInputs = await prepareLetterInputs(profileId, { dryRun: true });
      return buildLetterAnalysisPrompt({ ...letterInputs.analysis, texts: textsFor(settings, letterInputs.lang) });
    }
    case "letterWriting": {
      // The writer needs a brief: the analysis pass runs first with its saved settings.
      const letterInputs = await prepareLetterInputs(profileId, { dryRun: true });
      const { brief } = await runLetterAnalysis(letterInputs, await loadTaskSettings("letterAnalysis"));
      return buildLetterGenerationPrompt({
        astrologerName: letterInputs.astrologerName,
        language: letterInputs.lang,
        addressForm: letterInputs.addressForm,
        brief,
        texts: textsFor(settings, letterInputs.lang),
      });
    }
    case "newsDigest": {
      const { dossier, lang, residence } = await loadLetterContext(profileId, { dryRun: true });
      return buildNewsDigestPrompt({
        interestTags: dossier.interests,
        residence: residence.place,
        language: lang,
        date: new Date().toISOString().slice(0, 10),
        texts: textsFor(settings, lang),
      });
    }
    case "factExtraction":
      return buildFactExtractionPrompt({ text: requiredInput(inputs.question, "question", 2000), texts });
  }
}

export const adminTestAiTask = onCall({ secrets: AI_SECRETS, timeoutSeconds: 300 }, async (request) => {
  const admin = assertAdmin(request);
  const taskId = requireTaskId(request.data?.taskId);
  const override = parseOverride(request.data?.override);
  requireValid(taskId, override);
  const profileId = requiredInput(request.data?.profileId, "profileId", 200);
  const language = normalizeLanguage(request.data?.language);
  const inputs = (request.data?.inputs ?? {}) as TestInputs;

  // The unsaved settings: the editor sends the complete override it shows.
  const settings = mergeTaskSettings(taskId, override);
  let prompt: GenerationPrompt;
  try {
    prompt = await testPrompt(settings, profileId, language, inputs);
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.warn("AI test run could not build the prompt", { taskId, by: admin, error: (error as Error).message });
    throw new HttpsError("internal", `Could not prepare the test: ${(error as Error).message}`);
  }
  const started = Date.now();
  try {
    const result = await runTask(settings, prompt);
    logger.info("AI test run", { taskId, by: admin, model: result.model, costUsd: result.costUsd });
    return {
      text: result.text,
      model: result.model,
      provider: result.provider,
      usage: result.usage,
      costUsd: result.costUsd,
      durationMs: Date.now() - started,
      prompt: { system: prompt.systemInstruction, user: prompt.userPrompt },
    };
  } catch (error) {
    logger.warn("AI test run failed", { taskId, by: admin, error: (error as Error).message });
    throw new HttpsError("internal", (error as Error).message, {
      prompt: { system: prompt.systemInstruction, user: prompt.userPrompt },
    });
  }
});
