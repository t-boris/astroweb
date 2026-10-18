import OpenAI from "openai";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import { apiKeyFor, AiKeyMissingError } from "../keys";
import { AiRefusalError, type ProviderRequest, type ProviderResult } from "./types";

/**
 * OpenAI through the official SDK (DEC-015): Responses API with `store: false`,
 * so no conversation state is kept on OpenAI's side (DEC-018, REQ-012).
 */

const REQUEST_TIMEOUT_MS = 180_000;

let client: OpenAI | null = null;
let clientKey = "";

function openAiClient(apiKey: string): OpenAI {
  if (!client || clientKey !== apiKey) {
    client = new OpenAI({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 2 });
    clientKey = apiKey;
  }
  return client;
}

export function buildOpenAiParams(req: ProviderRequest): ResponseCreateParamsNonStreaming {
  const params: ResponseCreateParamsNonStreaming = {
    model: req.model.id,
    instructions: req.system,
    input: req.user,
    max_output_tokens: req.maxOutputTokens,
    store: false,
  };
  if (req.model.effort) {
    params.reasoning = { effort: req.model.effort as NonNullable<ResponseCreateParamsNonStreaming["reasoning"]>["effort"] };
  }
  if (req.temperature !== undefined) params.temperature = req.temperature;
  if (req.webSearch) params.tools = [{ type: "web_search" }];
  return params;
}

interface OutputItem {
  type: string;
  content?: { type: string; text?: string; refusal?: string }[];
}

export async function callOpenAi(req: ProviderRequest): Promise<ProviderResult> {
  const apiKey = apiKeyFor("openai");
  if (!apiKey) throw new AiKeyMissingError("openai");

  const response = await openAiClient(apiKey).responses.create(buildOpenAiParams(req));
  const output = (response.output ?? []) as OutputItem[];

  const refusal = output
    .flatMap((item) => (item.type === "message" ? item.content ?? [] : []))
    .find((part) => part.type === "refusal");
  if (refusal) throw new AiRefusalError("OpenAI", refusal.refusal ?? "refusal");
  if (response.status === "incomplete" && response.incomplete_details?.reason === "content_filter") {
    throw new AiRefusalError("OpenAI", "content_filter");
  }

  const text = output
    .flatMap((item) => (item.type === "message" ? item.content ?? [] : []))
    .filter((part) => part.type === "output_text")
    .map((part) => part.text ?? "")
    .join("");

  return {
    text,
    stopReason:
      response.status === "incomplete" && response.incomplete_details?.reason === "max_output_tokens" ? "max_tokens" : "end",
    model: response.model ?? req.model.id,
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      // Includes reasoning tokens, which are billed as output.
      outputTokens: response.usage?.output_tokens ?? 0,
      webSearches: output.filter((item) => item.type === "web_search_call").length,
    },
  };
}
