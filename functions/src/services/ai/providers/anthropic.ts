import { apiKeyFor, AiKeyMissingError } from "../keys";
import { AiRefusalError, type ProviderRequest, type ProviderResult } from "./types";

/**
 * Claude over raw HTTPS (the project's existing transport, kept by DEC-015).
 * Replaces the two former helpers in anthropic.ts and claudeRaw.ts.
 */

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const REQUEST_TIMEOUT_MS = 180_000;
/** Claude Opus 5.5 and Sonnet 5.5: on a refusal the API re-runs the request on a fallback model it picks. */
const REFUSAL_FALLBACK_BETA = "server-side-fallback-2026-07-01";
const REFUSAL_FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);

interface MessagesResponse {
  model?: string;
  stop_reason?: string | null;
  stop_details?: { category?: string | null; explanation?: string | null } | null;
  content?: { type?: string; text?: string }[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
    server_tool_use?: { web_search_requests?: number };
  };
  error?: { message?: string };
}

export function buildAnthropicBody(req: ProviderRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: req.model.id,
    max_tokens: req.maxOutputTokens,
    system: req.system,
    messages: [{ role: "user", content: req.user }],
  };
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.model.thinking === "always" && req.model.effort) body.output_config = { effort: req.model.effort };
  if (req.webSearch) {
    body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: req.webSearch.maxUses }];
  }
  if (REFUSAL_FALLBACK_MODELS.has(req.model.id)) body.fallbacks = "default";
  return body;
}

export async function callAnthropic(req: ProviderRequest): Promise<ProviderResult> {
  const apiKey = apiKeyFor("anthropic");
  if (!apiKey) throw new AiKeyMissingError("anthropic");

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
  };
  if (REFUSAL_FALLBACK_MODELS.has(req.model.id)) headers["anthropic-beta"] = REFUSAL_FALLBACK_BETA;

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify(buildAnthropicBody(req)),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  let parsed: MessagesResponse | null = null;
  try {
    parsed = (await response.json()) as MessagesResponse;
  } catch {
    // Raised below with the status code.
  }
  if (!response.ok || parsed?.error) {
    throw new Error(parsed?.error?.message ?? `Claude API error (${response.status})`);
  }
  if (parsed?.stop_reason === "refusal") {
    const details = parsed.stop_details;
    throw new AiRefusalError("Claude", details?.category ?? details?.explanation ?? "refusal");
  }

  const usage = parsed?.usage ?? {};
  return {
    text: (parsed?.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join(""),
    stopReason: parsed?.stop_reason === "max_tokens" ? "max_tokens" : "end",
    model: parsed?.model ?? req.model.id,
    usage: {
      inputTokens: (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
      outputTokens: usage.output_tokens ?? 0,
      webSearches: usage.server_tool_use?.web_search_requests ?? 0,
    },
  };
}
