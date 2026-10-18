import { createHash } from "node:crypto";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { providerConfigured } from "./keys";
import { ADMIN_MAX_OUTPUT_TOKENS, ADMIN_MIN_OUTPUT_TOKENS, findModel, type AiModel } from "./models";
import { checkTemplate } from "./template";
import {
  AI_TASKS,
  taskSpec,
  textLanguageFor,
  type AiTaskId,
  type AiTaskSpec,
  type TaskTexts,
  type TextLanguage,
} from "./tasks";

/**
 * Admin settings of the AI tasks (DEC-001): one document per task in
 * `aiSettings/{taskId}` holding only what differs from the code defaults, read
 * through a 60-second in-memory cache. Invalid stored values fall back to the
 * defaults part by part, so a bad setting never breaks a request (REQ-006).
 * Only the current value is kept, with who saved it and when (DEC-013).
 */

export const AI_SETTINGS_COLLECTION = "aiSettings";
export const SETTINGS_CACHE_TTL_MS = 60_000;
export const MAX_PROMPT_LENGTH = 20_000;

export interface TaskOverride {
  model?: string;
  maxOutputTokens?: number;
  /** null: send no temperature. */
  temperature?: number | null;
  texts?: Partial<Record<TextLanguage, Partial<TaskTexts>>>;
}

export interface StoredTaskSettings extends TaskOverride {
  updatedAt?: string;
  updatedBy?: string;
}

export interface EffectiveTaskSettings {
  taskId: AiTaskId;
  model: string;
  maxOutputTokens: number;
  temperature: number | null;
  /** Complete texts for every text language of the task. */
  texts: Partial<Record<TextLanguage, TaskTexts>>;
  /** Empty while the effective settings equal the defaults; otherwise changes with every change (DEC-004). */
  version: string;
}

// ---- Validation -------------------------------------------------------------

function textProblems(task: AiTaskSpec, language: TextLanguage, key: string, text: unknown): string[] {
  const part = task.parts.find((p) => p.key === key);
  if (!part) return [`Unknown prompt part "${key}"`];
  const where = `${part.label} (${language.toUpperCase()})`;
  if (typeof text !== "string" || text.trim().length === 0) return [`${where} is empty`];
  if (text.length > MAX_PROMPT_LENGTH) return [`${where} is longer than ${MAX_PROMPT_LENGTH} characters`];
  const allowed = part.placeholders.map((p) => p.name);
  const required = part.placeholders.filter((p) => !p.optional).map((p) => p.name);
  const { missing, unknown } = checkTemplate(text, allowed, required);
  const problems: string[] = [];
  if (missing.length) problems.push(`${where} is missing ${missing.map((n) => `{{${n}}}`).join(", ")}`);
  if (unknown.length) problems.push(`${where} uses unknown ${unknown.map((n) => `{{${n}}}`).join(", ")}`);
  return problems;
}

function modelProblems(task: AiTaskSpec, model: AiModel | undefined, id: unknown): string[] {
  if (!model) return [`Unknown model "${String(id)}"`];
  if (task.generation.webSearch && !model.webSearch) return [`${model.label} has no web search, which ${task.label} needs`];
  return [];
}

function limitProblems(model: AiModel, value: unknown): string[] {
  const max = Math.min(ADMIN_MAX_OUTPUT_TOKENS, model.maxOutputTokens);
  if (typeof value !== "number" || !Number.isInteger(value) || value < ADMIN_MIN_OUTPUT_TOKENS || value > max) {
    return [`Output limit must be a whole number from ${ADMIN_MIN_OUTPUT_TOKENS} to ${max}`];
  }
  return [];
}

function temperatureProblems(model: AiModel, value: unknown): string[] {
  if (value === null) return [];
  if (!model.temperature) return [`${model.label} does not accept a temperature`];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    return ["Temperature must be a number from 0 to 1"];
  }
  return [];
}

/**
 * Strict check of an override the admin wants to save or test. Returns every
 * problem; an empty list means the override is valid. With `requireProviderKey`
 * a model whose provider has no configured API key is refused (REQ-011).
 */
export function validateOverride(
  taskId: AiTaskId,
  override: TaskOverride,
  options: { requireProviderKey: boolean },
): string[] {
  const task = taskSpec(taskId);
  const problems: string[] = [];
  const modelId = override.model ?? task.defaults.model;
  const model = findModel(modelId);
  problems.push(...modelProblems(task, model, modelId));
  if (model && options.requireProviderKey && !providerConfigured(model.provider)) {
    problems.push(`${model.label} is unavailable: the ${model.provider} API key is not configured`);
  }
  if (model) {
    if (override.maxOutputTokens !== undefined) problems.push(...limitProblems(model, override.maxOutputTokens));
    if (override.temperature !== undefined) problems.push(...temperatureProblems(model, override.temperature));
  }
  for (const [language, texts] of Object.entries(override.texts ?? {})) {
    if (!task.languages.includes(language as TextLanguage)) {
      problems.push(`${task.label} has no ${language.toUpperCase()} texts`);
      continue;
    }
    for (const [key, text] of Object.entries(texts ?? {})) {
      problems.push(...textProblems(task, language as TextLanguage, key, text));
    }
  }
  return problems;
}

// ---- Effective settings -----------------------------------------------------

function settingsHash(settings: Omit<EffectiveTaskSettings, "version" | "taskId">): string {
  return createHash("sha256").update(JSON.stringify(settings)).digest("hex").slice(0, 16);
}

function defaultsOf(task: AiTaskSpec): Omit<EffectiveTaskSettings, "version" | "taskId"> {
  const texts: Partial<Record<TextLanguage, TaskTexts>> = {};
  for (const language of task.languages) texts[language] = { ...(task.defaults.texts[language] ?? {}) };
  return {
    model: task.defaults.model,
    maxOutputTokens: task.defaults.maxOutputTokens,
    temperature: task.defaults.temperature,
    texts,
  };
}

export function defaultTaskSettings(taskId: AiTaskId): EffectiveTaskSettings {
  return { taskId, ...defaultsOf(taskSpec(taskId)), version: "" };
}

/**
 * Defaults with every valid stored value applied. Each invalid stored value is
 * ignored with a warning, so the task keeps working on its defaults (REQ-006).
 */
export function mergeTaskSettings(taskId: AiTaskId, stored: StoredTaskSettings | null | undefined): EffectiveTaskSettings {
  const task = taskSpec(taskId);
  const defaults = defaultsOf(task);
  if (!stored) return { taskId, ...defaults, version: "" };
  const warn = (problem: string) => logger.warn("Ignoring invalid AI setting", { taskId, problem });

  let model = findModel(defaults.model) as AiModel;
  if (stored.model !== undefined) {
    const candidate = findModel(stored.model);
    const problems = modelProblems(task, candidate, stored.model);
    if (problems.length) problems.forEach(warn);
    else model = candidate as AiModel;
  }

  let maxOutputTokens = Math.min(defaults.maxOutputTokens, model.maxOutputTokens);
  if (stored.maxOutputTokens !== undefined) {
    const problems = limitProblems(model, stored.maxOutputTokens);
    if (problems.length) problems.forEach(warn);
    else maxOutputTokens = stored.maxOutputTokens;
  }

  let temperature = model.temperature ? defaults.temperature : null;
  if (stored.temperature !== undefined && model.temperature) {
    const problems = temperatureProblems(model, stored.temperature);
    if (problems.length) problems.forEach(warn);
    else temperature = stored.temperature;
  }

  const texts: Partial<Record<TextLanguage, TaskTexts>> = {};
  for (const language of task.languages) {
    const merged: TaskTexts = { ...(defaults.texts[language] ?? {}) };
    for (const [key, text] of Object.entries(stored.texts?.[language] ?? {})) {
      const problems = textProblems(task, language, key, text);
      if (problems.length) problems.forEach(warn);
      else merged[key] = text as string;
    }
    texts[language] = merged;
  }

  const effective = { model: model.id, maxOutputTokens, temperature, texts };
  const version = settingsHash(effective) === settingsHash(defaults) ? "" : settingsHash(effective);
  return { taskId, ...effective, version };
}

/** The texts a request in `language` uses. */
export function textsFor(settings: EffectiveTaskSettings, language: "en" | "ru"): TaskTexts {
  const task = taskSpec(settings.taskId);
  return settings.texts[textLanguageFor(task, language)] ?? {};
}

// ---- Store ------------------------------------------------------------------

const cache = new Map<AiTaskId, { at: number; settings: EffectiveTaskSettings }>();

export function clearTaskSettingsCache(): void {
  cache.clear();
}

export async function readStoredTaskSettings(taskId: AiTaskId): Promise<StoredTaskSettings | null> {
  const snap = await getFirestore().collection(AI_SETTINGS_COLLECTION).doc(taskId).get();
  return snap.exists ? ((snap.data() as StoredTaskSettings) ?? null) : null;
}

/** Effective settings of a task, at most SETTINGS_CACHE_TTL_MS old. Never throws. */
export async function loadTaskSettings(taskId: AiTaskId): Promise<EffectiveTaskSettings> {
  const hit = cache.get(taskId);
  if (hit && Date.now() - hit.at < SETTINGS_CACHE_TTL_MS) return hit.settings;
  let settings: EffectiveTaskSettings;
  try {
    settings = mergeTaskSettings(taskId, await readStoredTaskSettings(taskId));
  } catch (error) {
    logger.warn("Reading AI settings failed, using defaults", { taskId, error: (error as Error).message });
    settings = defaultTaskSettings(taskId);
  }
  cache.set(taskId, { at: Date.now(), settings });
  return settings;
}

/**
 * The part of `override` that differs from the defaults, without undefined
 * values (Firestore rejects them). Texts equal to their default are dropped,
 * so they show as "default" again.
 */
export function minimalOverride(taskId: AiTaskId, override: TaskOverride): TaskOverride {
  const task = taskSpec(taskId);
  const result: TaskOverride = {};
  if (override.model !== undefined && override.model !== task.defaults.model) result.model = override.model;
  if (override.maxOutputTokens !== undefined && override.maxOutputTokens !== task.defaults.maxOutputTokens) {
    result.maxOutputTokens = override.maxOutputTokens;
  }
  if (override.temperature !== undefined && override.temperature !== task.defaults.temperature) {
    result.temperature = override.temperature;
  }
  const texts: NonNullable<TaskOverride["texts"]> = {};
  for (const [language, parts] of Object.entries(override.texts ?? {})) {
    const defaults = task.defaults.texts[language as TextLanguage] ?? {};
    const changed: Partial<TaskTexts> = {};
    for (const [key, text] of Object.entries(parts ?? {})) {
      if (typeof text === "string" && text !== defaults[key]) changed[key] = text;
    }
    if (Object.keys(changed).length) texts[language as TextLanguage] = changed;
  }
  if (Object.keys(texts).length) result.texts = texts;
  return result;
}

/** Save the override of a task (already validated), replacing the previous one. Returns the effective settings. */
export async function saveTaskOverride(
  taskId: AiTaskId,
  override: TaskOverride,
  updatedBy: string,
): Promise<EffectiveTaskSettings> {
  const ref = getFirestore().collection(AI_SETTINGS_COLLECTION).doc(taskId);
  const minimal = minimalOverride(taskId, override);
  if (Object.keys(minimal).length === 0) {
    await ref.delete();
    cache.delete(taskId);
    return defaultTaskSettings(taskId);
  }
  const stored: StoredTaskSettings = { ...minimal, updatedAt: new Date().toISOString(), updatedBy };
  await ref.set(stored);
  cache.delete(taskId);
  return mergeTaskSettings(taskId, stored);
}

/** Remove every override of a task, so it runs on its code defaults again (REQ-004). */
export async function resetTaskOverride(taskId: AiTaskId): Promise<EffectiveTaskSettings> {
  await getFirestore().collection(AI_SETTINGS_COLLECTION).doc(taskId).delete();
  cache.delete(taskId);
  return defaultTaskSettings(taskId);
}

export const ALL_TASK_IDS: readonly AiTaskId[] = AI_TASKS.map((task) => task.id);
