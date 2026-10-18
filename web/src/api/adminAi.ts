import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

/** Mirrors functions/src/api/adminAi.ts (admin AI settings, REQ-001..005, REQ-009). */

export type AiProvider = "anthropic" | "openai" | "gemini";
export type TextLanguage = "en" | "ru" | "all";
export type TaskTexts = Record<string, string>;
export type TestInput = "question" | "topic" | "baseInterpretation" | "partnerProfileId" | "section";

export interface AiPlaceholder {
  name: string;
  description: string;
  optional?: boolean;
  collapsible?: boolean;
}

export interface AiPromptPart {
  key: string;
  label: string;
  description: string;
  placeholders: AiPlaceholder[];
}

export interface AiModelInfo {
  id: string;
  provider: AiProvider;
  label: string;
  inputPerMTok: number;
  outputPerMTok: number;
  nextPrice: { from: string; inputPerMTok: number; outputPerMTok: number } | null;
  maxOutputTokens: number;
  temperature: boolean;
  webSearch: boolean;
  available: boolean;
}

export interface AiTaskValues {
  model: string;
  maxOutputTokens: number;
  temperature: number | null;
  texts: Partial<Record<TextLanguage, TaskTexts>>;
}

export interface AiTaskOverride {
  model?: string;
  maxOutputTokens?: number;
  temperature?: number | null;
  texts?: Partial<Record<TextLanguage, Partial<TaskTexts>>>;
}

export interface AiTask {
  id: string;
  label: string;
  description: string;
  languages: TextLanguage[];
  parts: AiPromptPart[];
  testInputs: TestInput[];
  needsWebSearch: boolean;
  defaults: AiTaskValues;
  override: AiTaskOverride;
  effective: AiTaskValues & { version: string };
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface AiSettingsResponse {
  providers: Record<AiProvider, boolean>;
  models: AiModelInfo[];
  limits: { minOutputTokens: number; maxOutputTokens: number; maxPromptLength: number };
  tasks: AiTask[];
}

export interface AiTestRequest {
  taskId: string;
  override: AiTaskOverride;
  profileId: string;
  language: "en" | "ru";
  inputs: Partial<Record<TestInput, string>>;
}

export interface AiTestResult {
  text: string;
  model: string;
  provider: AiProvider;
  usage: { inputTokens: number; outputTokens: number; webSearches: number };
  costUsd: number;
  durationMs: number;
  prompt: { system: string; user: string };
}

export async function adminGetAiSettings(): Promise<AiSettingsResponse> {
  const fn = httpsCallable<void, AiSettingsResponse>(functions, "adminGetAiSettings");
  return (await fn()).data;
}

export async function adminSaveAiSettings(taskId: string, override: AiTaskOverride): Promise<AiTask> {
  const fn = httpsCallable<{ taskId: string; override: AiTaskOverride }, { task: AiTask }>(functions, "adminSaveAiSettings");
  return (await fn({ taskId, override })).data.task;
}

export async function adminResetAiSettings(taskId: string): Promise<AiTask> {
  const fn = httpsCallable<{ taskId: string }, { task: AiTask }>(functions, "adminResetAiSettings");
  return (await fn({ taskId })).data.task;
}

export async function adminTestAiTask(request: AiTestRequest): Promise<AiTestResult> {
  const fn = httpsCallable<AiTestRequest, AiTestResult>(functions, "adminTestAiTask", { timeout: 300_000 });
  return (await fn(request)).data;
}

/** The problems a refused save or test reports (HttpsError details), or its message. */
export function callableProblems(error: unknown): string[] {
  const details = (error as { details?: { problems?: unknown } })?.details;
  if (details && Array.isArray(details.problems)) return details.problems.map(String);
  return [(error as Error)?.message ?? String(error)];
}
