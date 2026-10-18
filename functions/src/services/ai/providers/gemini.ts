import { GoogleGenAI, ThinkingLevel, type GenerateContentConfig, type GenerateContentParameters } from "@google/genai";
import { apiKeyFor, AiKeyMissingError } from "../keys";
import { AiRefusalError, type ProviderRequest, type ProviderResult } from "./types";

/**
 * Gemini Developer API through the official SDK (DEC-015). Uses the stateless
 * generateContent call, not the Interactions API, which stores interactions by
 * default (DEC-018, REQ-012).
 */

const REQUEST_TIMEOUT_MS = 180_000;
const BLOCKING_FINISH_REASONS = new Set([
  "SAFETY",
  "RECITATION",
  "BLOCKLIST",
  "PROHIBITED_CONTENT",
  "SPII",
  "IMAGE_SAFETY",
]);

let client: GoogleGenAI | null = null;
let clientKey = "";

function geminiClient(apiKey: string): GoogleGenAI {
  if (!client || clientKey !== apiKey) {
    client = new GoogleGenAI({ apiKey, httpOptions: { timeout: REQUEST_TIMEOUT_MS } });
    clientKey = apiKey;
  }
  return client;
}

export function buildGeminiParams(req: ProviderRequest): GenerateContentParameters {
  const config: GenerateContentConfig = {
    systemInstruction: req.system,
    maxOutputTokens: req.maxOutputTokens,
  };
  if (req.model.effort) config.thinkingConfig = { thinkingLevel: req.model.effort as ThinkingLevel };
  if (req.temperature !== undefined) config.temperature = req.temperature;
  if (req.webSearch) config.tools = [{ googleSearch: {} }];
  return { model: req.model.id, contents: req.user, config };
}

interface Candidate {
  finishReason?: string;
  content?: { parts?: { text?: string; thought?: boolean }[] };
  groundingMetadata?: { webSearchQueries?: string[] };
}

export async function callGemini(req: ProviderRequest): Promise<ProviderResult> {
  const apiKey = apiKeyFor("gemini");
  if (!apiKey) throw new AiKeyMissingError("gemini");

  const response = await geminiClient(apiKey).models.generateContent(buildGeminiParams(req));
  const blockReason = response.promptFeedback?.blockReason;
  if (blockReason) throw new AiRefusalError("Gemini", String(blockReason));

  const candidate = (response.candidates?.[0] ?? {}) as Candidate;
  const finishReason = candidate.finishReason ? String(candidate.finishReason) : "";
  if (BLOCKING_FINISH_REASONS.has(finishReason)) throw new AiRefusalError("Gemini", finishReason);

  const usage = response.usageMetadata;
  return {
    // Thought parts are never part of the answer.
    text: (candidate.content?.parts ?? [])
      .filter((part) => typeof part.text === "string" && !part.thought)
      .map((part) => part.text ?? "")
      .join(""),
    stopReason: finishReason === "MAX_TOKENS" ? "max_tokens" : "end",
    model: response.modelVersion ?? req.model.id,
    usage: {
      inputTokens: usage?.promptTokenCount ?? 0,
      // Thinking tokens are billed as output.
      outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
      webSearches: candidate.groundingMetadata?.webSearchQueries?.length ?? 0,
    },
  };
}
