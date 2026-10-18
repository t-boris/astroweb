import type { AiModel, AiUsage } from "../models";

/** One single-turn request to a provider (system prompt + one user message). */
export interface ProviderRequest {
  model: AiModel;
  system: string;
  user: string;
  /** Output budget to send, already including reasoning headroom (requestOutputTokens). */
  maxOutputTokens: number;
  /** Sent only when set; callers pass it only for models that accept it. */
  temperature?: number;
  /** Use the provider's own web search (news digest, DEC-016). */
  webSearch?: { maxUses: number };
}

export interface ProviderResult {
  text: string;
  /** "max_tokens" when the answer was cut off by the output limit. */
  stopReason: "end" | "max_tokens";
  /** Model id that answered, as reported by the API. */
  model: string;
  usage: AiUsage;
}

/** The model declined or a safety filter blocked the request (REQ-011): a failure, never an empty answer. */
export class AiRefusalError extends Error {
  constructor(provider: string, detail: string) {
    super(`${provider} refused the request: ${detail}`);
    this.name = "AiRefusalError";
  }
}
