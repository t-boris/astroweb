/**
 * Minimal raw Anthropic Messages call with tool + usage support (the existing
 * anthropic.ts helper doesn't expose tools/usage). Used by the letter engine
 * and news digest. Requires the function to declare secret ANTHROPIC_API_KEY.
 */
const ENDPOINT = "https://api.anthropic.com/v1/messages";
const VERSION = "2023-06-01";

export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  server_tool_use?: { web_search_requests?: number };
}
export interface ClaudeRawResult {
  text: string;
  usage: ClaudeUsage;
  stopReason: string | null;
  model: string;
}

export interface ClaudeRawInput {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  tools?: unknown[];
  temperature?: number;
}

export async function callClaudeRaw(input: ClaudeRawInput): Promise<ClaudeRawResult> {
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const body: Record<string, unknown> = {
    model: input.model,
    max_tokens: input.maxTokens,
    system: input.system,
    messages: [{ role: "user", content: input.user }],
  };
  if (input.tools) body.tools = input.tools;
  if (typeof input.temperature === "number") body.temperature = input.temperature;

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": VERSION, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as {
    content?: { type: string; text?: string }[];
    usage?: ClaudeUsage;
    stop_reason?: string;
    model?: string;
    error?: { message?: string };
  };
  if (!res.ok || json.error) {
    throw new Error(`Anthropic error: ${json.error?.message ?? res.status}`);
  }
  const text = (json.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  return {
    text,
    usage: json.usage ?? { input_tokens: 0, output_tokens: 0 },
    stopReason: json.stop_reason ?? null,
    model: json.model ?? input.model,
  };
}

const RATE: Record<string, [number, number]> = {
  "claude-opus-4-8": [5e-6, 25e-6],
  "claude-sonnet-4-6": [3e-6, 15e-6],
  "claude-haiku-4-5": [1e-6, 5e-6],
};
export function usageCostUsd(model: string, u: ClaudeUsage): number {
  const [pin, pout] = RATE[model] ?? [5e-6, 25e-6];
  const inTok = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  const search = (u.server_tool_use?.web_search_requests ?? 0) * 0.01;
  return inTok * pin + (u.output_tokens ?? 0) * pout + search;
}

/** Extract a JSON object/array from a model response (tolerates narration/fences). */
export function extractJson<T>(s: string, kind: "object" | "array" = "object"): T {
  let t = s;
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1];
  const open = kind === "object" ? "{" : "[";
  const close = kind === "object" ? "}" : "]";
  const i = t.indexOf(open);
  const j = t.lastIndexOf(close);
  if (i >= 0 && j > i) t = t.slice(i, j + 1);
  return JSON.parse(t.trim()) as T;
}
