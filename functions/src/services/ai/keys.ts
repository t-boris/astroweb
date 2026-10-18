import type { AiProvider } from "./models";

/**
 * API keys of the AI providers. They come only from Secret Manager bindings
 * (REQ-012) and are never logged or returned. Until the owner adds a real key,
 * a secret holds the placeholder "unset"; a provider counts as configured only
 * when its key has the provider's format (DEC-019).
 */

/** Bind these on every function that runs an AI task. */
export const AI_SECRETS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"];

const KEY_ENV: Record<AiProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
};

const KEY_PATTERN: Record<AiProvider, RegExp> = {
  anthropic: /sk-ant-[A-Za-z0-9_-]+/,
  openai: /sk-[A-Za-z0-9_-]{20,}/,
  gemini: /AIza[A-Za-z0-9_-]{30,}/,
};

/** The provider's key, or null when it is missing or still the placeholder. */
export function apiKeyFor(provider: AiProvider): string | null {
  const raw = process.env[KEY_ENV[provider]]?.trim() ?? "";
  return raw.match(KEY_PATTERN[provider])?.[0] ?? null;
}

export function providerConfigured(provider: AiProvider): boolean {
  return apiKeyFor(provider) !== null;
}

export class AiKeyMissingError extends Error {
  constructor(provider: AiProvider) {
    super(`${KEY_ENV[provider]} is not configured`);
    this.name = "AiKeyMissingError";
  }
}
