/**
 * The AI models the admin may choose for a task (DEC-002), for every provider
 * (DEC-014). Each entry carries the request rules the transports follow, so any
 * model in this list yields a request its API accepts. Ids, prices and
 * parameter rules were checked against the providers' docs on 2026-10-18.
 * Adding a model is a code change with a test.
 */

export type AiProvider = "anthropic" | "openai" | "gemini";

export interface ModelPrice {
  /** First day (YYYY-MM-DD, UTC) this price applies. */
  from: string;
  inputPerMTok: number;
  outputPerMTok: number;
}

export interface AiModel {
  id: string;
  provider: AiProvider;
  label: string;
  /** Ascending by `from`; the first entry applies from the beginning. */
  prices: ModelPrice[];
  /** Highest output limit the admin may set for this model. */
  maxOutputTokens: number;
  /** Whether the API accepts a `temperature` value for this model. */
  temperature: boolean;
  /**
   * How the model reasons. "none": no reasoning tokens (nothing to configure).
   * "always": the model reasons and its reasoning tokens count against the
   * output limit, so the server adds headroom (THINKING_HEADROOM_TOKENS) and
   * sends the provider's lowest suitable effort.
   */
  thinking: "none" | "always";
  /** Provider effort value the server sends when `thinking` is "always" (or to keep reasoning off). */
  effort?: string;
  /** Whether the provider's own web search can be used with this model (news digest, DEC-016). */
  webSearch: boolean;
}

/** Extra output budget for models whose reasoning counts against the output limit. */
export const THINKING_HEADROOM_TOKENS = 16_000;

/** The admin's output limit is capped here for every model (requests are not streamed). */
export const ADMIN_MAX_OUTPUT_TOKENS = 32_000;
export const ADMIN_MIN_OUTPUT_TOKENS = 256;

/** USD per web search, by provider (Gemini's monthly free allowance is ignored, so its cost is an upper bound). */
export const WEB_SEARCH_PRICE_USD: Record<AiProvider, number> = {
  anthropic: 0.01,
  openai: 0.01,
  gemini: 0.014,
};

const ALWAYS = "2000-01-01";

export const AI_MODELS: readonly AiModel[] = [
  // Anthropic Claude (raw HTTPS transport).
  {
    id: "claude-opus-4-8",
    provider: "anthropic",
    label: "Claude Opus 4.8",
    prices: [{ from: ALWAYS, inputPerMTok: 5, outputPerMTok: 25 }],
    maxOutputTokens: 32_000,
    temperature: false,
    thinking: "none",
    webSearch: true,
  },
  {
    id: "claude-sonnet-4-6",
    provider: "anthropic",
    label: "Claude Sonnet 4.6",
    prices: [{ from: ALWAYS, inputPerMTok: 3, outputPerMTok: 15 }],
    maxOutputTokens: 32_000,
    temperature: true,
    thinking: "none",
    webSearch: true,
  },
  {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    label: "Claude Haiku 4.5",
    prices: [{ from: ALWAYS, inputPerMTok: 1, outputPerMTok: 5 }],
    maxOutputTokens: 32_000,
    temperature: true,
    thinking: "none",
    webSearch: true,
  },
  {
    id: "claude-opus-5-5",
    provider: "anthropic",
    label: "Claude Opus 5.5",
    prices: [{ from: ALWAYS, inputPerMTok: 4, outputPerMTok: 20 }],
    maxOutputTokens: 32_000,
    temperature: false,
    thinking: "always",
    effort: "low",
    webSearch: true,
  },
  {
    id: "claude-sonnet-5-5",
    provider: "anthropic",
    label: "Claude Sonnet 5.5",
    prices: [{ from: ALWAYS, inputPerMTok: 2, outputPerMTok: 10 }],
    maxOutputTokens: 32_000,
    temperature: false,
    thinking: "always",
    effort: "low",
    webSearch: true,
  },
  {
    id: "claude-haiku-5-5",
    provider: "anthropic",
    label: "Claude Haiku 5.5",
    prices: [{ from: ALWAYS, inputPerMTok: 0.1, outputPerMTok: 0.5 }],
    maxOutputTokens: 32_000,
    temperature: false,
    thinking: "always",
    effort: "low",
    webSearch: true,
  },
  // OpenAI (official SDK, Responses API with store: false, DEC-015, DEC-018).
  {
    id: "gpt-6-astra",
    provider: "openai",
    label: "GPT-6 Astra",
    prices: [{ from: ALWAYS, inputPerMTok: 10, outputPerMTok: 50 }],
    maxOutputTokens: 32_000,
    temperature: false,
    thinking: "always",
    effort: "low",
    webSearch: true,
  },
  {
    id: "gpt-6.1-sol",
    provider: "openai",
    label: "GPT-6.1 Sol",
    prices: [{ from: ALWAYS, inputPerMTok: 2, outputPerMTok: 10 }],
    maxOutputTokens: 32_000,
    temperature: false,
    thinking: "always",
    effort: "low",
    webSearch: true,
  },
  {
    id: "gpt-6-luna",
    provider: "openai",
    label: "GPT-6 Luna",
    prices: [{ from: ALWAYS, inputPerMTok: 0.1, outputPerMTok: 0.5 }],
    maxOutputTokens: 32_000,
    // Luna accepts reasoning effort "none", and temperature only then.
    temperature: true,
    thinking: "none",
    effort: "none",
    webSearch: true,
  },
  // Google Gemini (official SDK, generateContent, DEC-015, DEC-018).
  {
    id: "gemini-4-argon",
    provider: "gemini",
    label: "Gemini 4 Argon",
    prices: [
      { from: ALWAYS, inputPerMTok: 2, outputPerMTok: 10 },
      { from: "2026-12-01", inputPerMTok: 4, outputPerMTok: 20 },
    ],
    maxOutputTokens: 32_000,
    temperature: false,
    thinking: "always",
    effort: "LOW",
    webSearch: true,
  },
  {
    id: "gemini-3.8-flash",
    provider: "gemini",
    label: "Gemini 3.8 Flash",
    prices: [
      { from: ALWAYS, inputPerMTok: 0.75, outputPerMTok: 3.75 },
      { from: "2027-01-01", inputPerMTok: 1.5, outputPerMTok: 7.5 },
    ],
    maxOutputTokens: 32_000,
    temperature: false,
    thinking: "always",
    effort: "LOW",
    webSearch: true,
  },
  {
    id: "gemini-3.5-flash-lite",
    provider: "gemini",
    label: "Gemini 3.5 Flash-Lite",
    prices: [{ from: ALWAYS, inputPerMTok: 0.3, outputPerMTok: 2.5 }],
    maxOutputTokens: 32_000,
    temperature: false,
    // MINIMAL does not guarantee that thinking is off, so keep the headroom.
    thinking: "always",
    effort: "MINIMAL",
    webSearch: true,
  },
];

const MODELS_BY_ID = new Map(AI_MODELS.map((model) => [model.id, model]));

export function findModel(id: string | undefined | null): AiModel | undefined {
  return id ? MODELS_BY_ID.get(id) : undefined;
}

export function priceOn(model: AiModel, date: Date = new Date()): ModelPrice {
  const day = date.toISOString().slice(0, 10);
  let current = model.prices[0];
  for (const price of model.prices) {
    if (price.from <= day) current = price;
  }
  return current;
}

export interface AiUsage {
  inputTokens: number;
  /** Visible output plus reasoning tokens (all billed as output). */
  outputTokens: number;
  webSearches: number;
}

export function costUsd(model: AiModel, usage: AiUsage, date: Date = new Date()): number {
  const price = priceOn(model, date);
  return (
    (usage.inputTokens * price.inputPerMTok) / 1_000_000 +
    (usage.outputTokens * price.outputPerMTok) / 1_000_000 +
    usage.webSearches * WEB_SEARCH_PRICE_USD[model.provider]
  );
}

/** Output budget sent to the API: the admin's limit plus room for reasoning where it counts against the limit. */
export function requestOutputTokens(model: AiModel, limit: number): number {
  return model.thinking === "always" ? limit + THINKING_HEADROOM_TOKENS : limit;
}
