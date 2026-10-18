import type {
  AiModelInfo,
  AiPromptPart,
  AiSettingsResponse,
  AiTask,
  AiTaskOverride,
  TaskTexts,
  TextLanguage,
} from "@/api/adminAi";

/**
 * Pure helpers of the admin AI tab: the editor draft of a task and the same
 * checks the server runs on save (functions/src/services/ai/settings.ts), so
 * problems show while typing. The server stays the authority (REQ-002, REQ-003).
 */

export interface AiDraft {
  model: string;
  maxOutputTokens: number;
  temperature: number | null;
  texts: Partial<Record<TextLanguage, TaskTexts>>;
}

const PLACEHOLDER = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;

export function placeholdersIn(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(PLACEHOLDER)) {
    if (!names.includes(match[1])) names.push(match[1]);
  }
  return names;
}

function cloneTexts(texts: Partial<Record<TextLanguage, TaskTexts>>): Partial<Record<TextLanguage, TaskTexts>> {
  return Object.fromEntries(Object.entries(texts).map(([language, parts]) => [language, { ...parts }]));
}

/** The editor starts from what the task runs on now. */
export function draftFromTask(task: AiTask): AiDraft {
  return {
    model: task.effective.model,
    maxOutputTokens: task.effective.maxOutputTokens,
    temperature: task.effective.temperature,
    texts: cloneTexts(task.effective.texts),
  };
}

/** The complete settings the draft stands for; the server keeps only what differs from the defaults. */
export function draftOverride(draft: AiDraft): AiTaskOverride {
  return {
    model: draft.model,
    maxOutputTokens: draft.maxOutputTokens,
    temperature: draft.temperature,
    texts: cloneTexts(draft.texts),
  };
}

function sameValues(a: AiDraft, b: AiDraft): boolean {
  return JSON.stringify(draftOverride(a)) === JSON.stringify(draftOverride(b));
}

/** Unsaved changes compared to what the task runs on now. */
export function draftChanged(task: AiTask, draft: AiDraft): boolean {
  return !sameValues(draftFromTask(task), draft);
}

export function partIsCustom(task: AiTask, draft: AiDraft, language: TextLanguage, key: string): boolean {
  return (draft.texts[language]?.[key] ?? "") !== (task.defaults.texts[language]?.[key] ?? "");
}

/** Model, output limit or temperature differ from the code defaults. */
export function modelSettingsAreCustom(task: AiTask, draft: AiDraft): boolean {
  return (
    draft.model !== task.defaults.model ||
    draft.maxOutputTokens !== task.defaults.maxOutputTokens ||
    draft.temperature !== task.defaults.temperature
  );
}

/** Switch the model: temperature only where the model accepts it, the output limit within the model's limit. */
export function withModel(draft: AiDraft, model: AiModelInfo, task: AiTask): AiDraft {
  return {
    ...draft,
    model: model.id,
    maxOutputTokens: Math.min(draft.maxOutputTokens, model.maxOutputTokens),
    temperature: model.temperature ? draft.temperature ?? task.defaults.temperature : null,
  };
}

export function withText(draft: AiDraft, language: TextLanguage, key: string, text: string): AiDraft {
  return { ...draft, texts: { ...draft.texts, [language]: { ...(draft.texts[language] ?? {}), [key]: text } } };
}

/** Problems of one prompt part, worded like the server's. */
export function partIssues(part: AiPromptPart, language: TextLanguage, text: string, maxLength: number): string[] {
  const where = `${part.label} (${language.toUpperCase()})`;
  if (text.trim().length === 0) return [`${where} is empty`];
  if (text.length > maxLength) return [`${where} is longer than ${maxLength} characters`];
  const used = placeholdersIn(text);
  const allowed = part.placeholders.map((p) => p.name);
  const missing = part.placeholders.filter((p) => !p.optional && !used.includes(p.name)).map((p) => p.name);
  const unknown = used.filter((name) => !allowed.includes(name));
  const issues: string[] = [];
  if (missing.length) issues.push(`${where} is missing ${missing.map((n) => `{{${n}}}`).join(", ")}`);
  if (unknown.length) issues.push(`${where} uses unknown ${unknown.map((n) => `{{${n}}}`).join(", ")}`);
  return issues;
}

/** Every problem that would make the server refuse the draft. */
export function draftIssues(task: AiTask, draft: AiDraft, settings: Pick<AiSettingsResponse, "models" | "limits">): string[] {
  const issues: string[] = [];
  const model = settings.models.find((m) => m.id === draft.model);
  if (!model) {
    issues.push(`Unknown model "${draft.model}"`);
  } else {
    if (!model.available) issues.push(`${model.label} is unavailable: the ${model.provider} API key is not configured`);
    if (task.needsWebSearch && !model.webSearch) issues.push(`${model.label} has no web search, which ${task.label} needs`);
    const max = Math.min(settings.limits.maxOutputTokens, model.maxOutputTokens);
    if (!Number.isInteger(draft.maxOutputTokens) || draft.maxOutputTokens < settings.limits.minOutputTokens || draft.maxOutputTokens > max) {
      issues.push(`Output limit must be a whole number from ${settings.limits.minOutputTokens} to ${max}`);
    }
    if (draft.temperature !== null) {
      if (!model.temperature) issues.push(`${model.label} does not accept a temperature`);
      else if (!Number.isFinite(draft.temperature) || draft.temperature < 0 || draft.temperature > 1) {
        issues.push("Temperature must be a number from 0 to 1");
      }
    }
  }
  for (const language of task.languages) {
    for (const part of task.parts) {
      issues.push(...partIssues(part, language, draft.texts[language]?.[part.key] ?? "", settings.limits.maxPromptLength));
    }
  }
  return issues;
}

export function formatUsd(value: number): string {
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

export function formatPrice(model: Pick<AiModelInfo, "inputPerMTok" | "outputPerMTok">): string {
  return `$${model.inputPerMTok} / $${model.outputPerMTok} per 1M tokens (in / out)`;
}

export const PROVIDER_LABELS: Record<AiModelInfo["provider"], string> = {
  anthropic: "Anthropic Claude",
  openai: "OpenAI",
  gemini: "Google Gemini",
};
