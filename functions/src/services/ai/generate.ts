import { logger } from "firebase-functions/v2";
import { costUsd, findModel, requestOutputTokens, type AiModel, type AiProvider, type AiUsage } from "./models";
import { callAnthropic } from "./providers/anthropic";
import { callGemini } from "./providers/gemini";
import { callOpenAi } from "./providers/openai";
import type { ProviderRequest, ProviderResult } from "./providers/types";

/**
 * Provider-neutral text generation for every AI task: one request shape, the
 * continuation loop for cut-off answers and output cleaning that used to live in
 * anthropic.ts, and token usage and cost for every provider (REQ-011).
 */

export interface GenerationSettings {
  model: string;
  maxOutputTokens: number;
  /** null: not sent. Ignored for models that do not accept temperature. */
  temperature: number | null;
}

export interface GenerationPrompt {
  systemInstruction: string;
  userPrompt: string;
}

export interface GenerationOptions {
  /** Ask for a continuation when the answer was cut off (or lacks requireEndTag). */
  continuation: boolean;
  /** Remove continuation artifacts and the end tag from the answer. */
  sanitize: boolean;
  /** Keep requesting continuation until this tag appears (or attempts run out). */
  requireEndTag?: string;
  /** Use the provider's own web search (news digest, DEC-016). */
  webSearch?: { maxUses: number };
}

export interface GenerationResult {
  text: string;
  /** Model id that answered, as reported by the provider. */
  model: string;
  provider: AiProvider;
  usage: AiUsage;
  costUsd: number;
}

const MAX_ATTEMPTS = 3;

const TRANSPORTS: Record<AiProvider, (req: ProviderRequest) => Promise<ProviderResult>> = {
  anthropic: callAnthropic,
  openai: callOpenAi,
  gemini: callGemini,
};

export function resolveModel(id: string): AiModel {
  const model = findModel(id);
  if (!model) throw new Error(`Unknown AI model: ${id}`);
  return model;
}

export async function generateText(
  settings: GenerationSettings,
  prompt: GenerationPrompt,
  options: GenerationOptions,
): Promise<GenerationResult> {
  const model = resolveModel(settings.model);
  const transport = TRANSPORTS[model.provider];
  const base: Omit<ProviderRequest, "user"> = {
    model,
    system: prompt.systemInstruction,
    maxOutputTokens: requestOutputTokens(model, settings.maxOutputTokens),
    ...(model.temperature && settings.temperature !== null ? { temperature: settings.temperature } : {}),
    ...(options.webSearch ? { webSearch: options.webSearch } : {}),
  };

  const usage: AiUsage = { inputTokens: 0, outputTokens: 0, webSearches: 0 };
  let usedModel = model.id;
  let fullText = "";
  let user = prompt.userPrompt;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const result = await transport({ ...base, user });
    usage.inputTokens += result.usage.inputTokens;
    usage.outputTokens += result.usage.outputTokens;
    usage.webSearches += result.usage.webSearches;
    usedModel = result.model;

    const text = result.text.trim();
    if (!text) {
      if (!fullText) throw new Error(`${model.label} returned an empty response`);
      break;
    }
    fullText = fullText ? `${fullText}\n\n${text}` : text;

    const done = options.requireEndTag
      ? fullText.includes(options.requireEndTag)
      : result.stopReason !== "max_tokens";
    if (done || !options.continuation) break;

    if (attempt === MAX_ATTEMPTS - 1) {
      logger.warn("AI answer still incomplete after continuation", { model: model.id, attempts: MAX_ATTEMPTS });
      break;
    }
    user = [
      "Continue the SAME answer from the exact stopping point.",
      "Do not repeat previous sections, do not restart, no intro.",
      "Keep the exact same language and style.",
      ...(options.requireEndTag ? [`Make sure to end the full answer with: ${options.requireEndTag}`] : []),
      "Last generated fragment:",
      fullText.slice(-1800),
    ].join("\n\n");
  }

  const finalText = fullText.trim();
  return {
    text: options.sanitize ? sanitizeAiOutput(finalText) : finalText,
    model: usedModel,
    provider: model.provider,
    usage,
    costUsd: costUsd(model, usage),
  };
}

export function sanitizeAiOutput(input: string): string {
  const rawLines = input
    .replace(/\r\n/g, "\n")
    .split("\n");

  const filteredLines = rawLines.filter((line) => {
      const normalized = line.trim().toLowerCase();
      return !(
        normalized.startsWith("of fragment to start from") ||
        normalized.startsWith("*continuation:*") ||
        normalized.startsWith("last generated fragment:") ||
        normalized.startsWith("continue the same answer") ||
        normalized.startsWith('"of fragment to start from') ||
        normalized === '"' ||
        normalized === "'"
      );
    });

  // Remove near-duplicate adjacent lines keeping the longer one.
  const deduped: string[] = [];
  for (const line of filteredLines) {
    const current = line.trim();
    if (!current) {
      deduped.push(line);
      continue;
    }

    const prev = deduped.length > 0 ? deduped[deduped.length - 1].trim() : "";
    const prevLower = prev.toLowerCase();
    const currentLower = current.toLowerCase();

    if (
      prevLower &&
      (prevLower === currentLower ||
        prevLower.startsWith(currentLower) ||
        currentLower.startsWith(prevLower))
    ) {
      if (current.length > prev.length) {
        deduped[deduped.length - 1] = line;
      }
      continue;
    }

    deduped.push(line);
  }

  return deduped
    .join("\n")
    .replace(/\*Continuation:\*\s*/gi, "")
    .replace(/\[END_OF_REPORT\]/g, "")
    .replace(/^["']+\s*/gm, "")
    .replace(/\s*["']+\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
