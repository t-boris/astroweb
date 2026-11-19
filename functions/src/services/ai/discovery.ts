import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { apiKeyFor } from "./keys";
import {
  ADMIN_MAX_OUTPUT_TOKENS,
  AI_MODELS,
  CATALOG_UPDATED_AT,
  registerDiscoveredModels,
  type AiModel,
  type AiProvider,
} from "./models";

/**
 * Live discovery of newly released AI models from configured providers
 * (Anthropic, OpenAI, Google Gemini). Keeps the curated table authoritative
 * for known models while automatically surfacing releases published after
 * `CATALOG_UPDATED_AT` so new models appear in Admin without waiting for a
 * code deploy.
 */

export const DISCOVERED_MODELS_DOC = "_discoveredModels";
const AI_SETTINGS_COLLECTION = "aiSettings";
const DISCOVERY_TIMEOUT_MS = 5_000;
const PERSISTED_CACHE_TTL_MS = 60_000;

const CURATED_IDS = new Set(AI_MODELS.map((m) => m.id));
const CATALOG_CUTOFF_MS = Date.parse(`${CATALOG_UPDATED_AT}T23:59:59Z`);

const ANTHROPIC_LIVE_RE = /^claude-(fable|mythos|opus|sonnet|haiku)-\d+(?:[.-]\d+)*$/;
const DATED_SUFFIX_RE = /-(?:20\d{6}|20\d{2}-\d{2}-\d{2})$/;
const OPENAI_LIVE_RE = /^gpt-([6-9](?:\.\d+)?)-([a-z][a-z0-9-]*)$/;
const OPENAI_EXCLUDED_RE = /(?:audio|realtime|tts|whisper|image|transcribe|embed|moderation|search|codex|preview)/i;
const GEMINI_LIVE_RE = /^gemini-([4-9](?:\.\d+)?)-([a-z][a-z0-9-]*)$/;
const GEMINI_EXCLUDED_RE = /(?:embedding|imagen|veo|tts|audio|live|robotics|computer-use|exp|-\d{3}$)/i;

function titleCaseWord(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function formatLiveLabel(provider: AiProvider, id: string, displayName?: string): string {
  if (displayName && displayName.trim()) return displayName.trim();
  const parts = id.split("-");
  if (provider === "anthropic") {
    return parts.map((p, idx) => (idx === 0 ? "Claude" : /^\d+$/.test(p) ? p : titleCaseWord(p))).join(" ").replace(/(\d+)\s+(\d+)$/, "$1.$2");
  }
  if (provider === "openai") {
    return parts.map((p, idx) => (idx === 0 ? "GPT" : titleCaseWord(p))).join(" ").replace(/^GPT\s+/, "GPT-");
  }
  return parts.map((p, idx) => (idx === 0 ? "Gemini" : titleCaseWord(p))).join(" ");
}

/** Build conservative request rules for a newly discovered modern model. */
export function buildLiveModelSpec(provider: AiProvider, id: string, displayName?: string): AiModel {
  const model: AiModel = {
    id,
    provider,
    label: formatLiveLabel(provider, id, displayName),
    prices: [],
    maxOutputTokens: ADMIN_MAX_OUTPUT_TOKENS,
    temperature: false,
    thinking: "always",
    effort: provider === "gemini" ? "LOW" : "low",
    webSearch: true,
    live: true,
  };
  if (provider === "anthropic" && !id.includes("-haiku-")) {
    model.refusalFallback = true;
  }
  return model;
}

function isNewerThanCatalogDate(isoOrEpoch: string | number | undefined): boolean {
  if (typeof isoOrEpoch === "number" && Number.isFinite(isoOrEpoch)) {
    const ms = isoOrEpoch < 1e12 ? isoOrEpoch * 1000 : isoOrEpoch;
    return ms > CATALOG_CUTOFF_MS;
  }
  if (typeof isoOrEpoch === "string" && isoOrEpoch) {
    const ms = Date.parse(isoOrEpoch);
    return Number.isFinite(ms) && ms > CATALOG_CUTOFF_MS;
  }
  return false;
}

function isPostCatalogOpenAiVersion(version: string): boolean {
  const [majorStr, minorStr = "0"] = version.split(".");
  const major = Number(majorStr);
  const minor = Number(minorStr);
  return major > 6 || (major === 6 && minor >= 3);
}

function isPostCatalogGeminiVersion(version: string): boolean {
  const [majorStr, minorStr = "0"] = version.split(".");
  const major = Number(majorStr);
  const minor = Number(minorStr);
  return major > 4 || (major === 4 && minor >= 1);
}

async function fetchAnthropicLiveModels(apiKey: string): Promise<AiModel[]> {
  const response = await fetch("https://api.anthropic.com/v1/models?limit=100", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
  });
  if (!response.ok) return [];
  const parsed = (await response.json()) as { data?: { id?: string; display_name?: string; created_at?: string }[] };
  const models: AiModel[] = [];
  for (const item of parsed.data ?? []) {
    const id = item.id?.trim();
    if (!id || CURATED_IDS.has(id)) continue;
    if (DATED_SUFFIX_RE.test(id) || !ANTHROPIC_LIVE_RE.test(id)) continue;
    if (!isNewerThanCatalogDate(item.created_at)) continue;
    models.push(buildLiveModelSpec("anthropic", id, item.display_name));
  }
  return models;
}

async function fetchOpenAiLiveModels(apiKey: string): Promise<AiModel[]> {
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
  });
  if (!response.ok) return [];
  const parsed = (await response.json()) as { data?: { id?: string; created?: number }[] };
  const models: AiModel[] = [];
  for (const item of parsed.data ?? []) {
    const id = item.id?.trim();
    if (!id || CURATED_IDS.has(id)) continue;
    if (DATED_SUFFIX_RE.test(id) || OPENAI_EXCLUDED_RE.test(id)) continue;
    const match = OPENAI_LIVE_RE.exec(id);
    if (!match) continue;
    if (!isPostCatalogOpenAiVersion(match[1]) && !isNewerThanCatalogDate(item.created)) continue;
    models.push(buildLiveModelSpec("openai", id));
  }
  return models;
}

async function fetchGeminiLiveModels(apiKey: string): Promise<AiModel[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS) });
  if (!response.ok) return [];
  const parsed = (await response.json()) as {
    models?: { name?: string; displayName?: string; supportedGenerationMethods?: string[] }[];
  };
  const models: AiModel[] = [];
  for (const item of parsed.models ?? []) {
    const rawName = item.name?.trim() ?? "";
    const id = rawName.startsWith("models/") ? rawName.slice("models/".length) : rawName;
    if (!id || CURATED_IDS.has(id)) continue;
    if (!(item.supportedGenerationMethods ?? []).includes("generateContent")) continue;
    if (DATED_SUFFIX_RE.test(id) || GEMINI_EXCLUDED_RE.test(id)) continue;
    const match = GEMINI_LIVE_RE.exec(id);
    if (!match) continue;
    if (!isPostCatalogGeminiVersion(match[1])) continue;
    models.push(buildLiveModelSpec("gemini", id, item.displayName));
  }
  return models;
}

/** Query every configured provider for newly released models (fail-open per provider). */
export async function discoverLiveModels(): Promise<AiModel[]> {
  const tasks: Promise<AiModel[]>[] = [];
  const anthropicKey = apiKeyFor("anthropic");
  const openAiKey = apiKeyFor("openai");
  const geminiKey = apiKeyFor("gemini");
  if (anthropicKey) tasks.push(fetchAnthropicLiveModels(anthropicKey));
  if (openAiKey) tasks.push(fetchOpenAiLiveModels(openAiKey));
  if (geminiKey) tasks.push(fetchGeminiLiveModels(geminiKey));
  if (tasks.length === 0) return [];

  const settled = await Promise.allSettled(tasks);
  const discovered: AiModel[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") {
      discovered.push(...result.value);
    } else {
      logger.warn("Live AI model discovery failed for a provider", {
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  }
  registerDiscoveredModels(discovered);
  return discovered;
}

// ---- Firestore persistence for saved live-discovered models -----------------

let persistedLoadedAt = 0;

export function clearDiscoveredModelsCache(): void {
  persistedLoadedAt = 0;
}

function isStoredModelRecord(value: unknown): value is { id: string; provider: AiProvider; label: string } {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    v.id.trim().length > 0 &&
    (v.provider === "anthropic" || v.provider === "openai" || v.provider === "gemini") &&
    typeof v.label === "string" &&
    v.label.trim().length > 0
  );
}

/** Load previously saved live-discovered models so runtime callables know how to call them. */
export async function loadPersistedDiscoveredModels(force = false): Promise<AiModel[]> {
  if (!force && persistedLoadedAt > 0 && Date.now() - persistedLoadedAt < PERSISTED_CACHE_TTL_MS) {
    return [];
  }
  try {
    const snap = await getFirestore().collection(AI_SETTINGS_COLLECTION).doc(DISCOVERED_MODELS_DOC).get();
    persistedLoadedAt = Date.now();
    if (!snap.exists) return [];
    const raw = (snap.data()?.models ?? {}) as Record<string, unknown>;
    const loaded: AiModel[] = [];
    for (const entry of Object.values(raw)) {
      if (!isStoredModelRecord(entry)) continue;
      if (CURATED_IDS.has(entry.id)) continue;
      loaded.push(buildLiveModelSpec(entry.provider, entry.id, entry.label));
    }
    registerDiscoveredModels(loaded);
    return loaded;
  } catch (error) {
    logger.warn("Failed to load persisted discovered AI models", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/** Persist a live-discovered model spec when an admin selects and saves it. */
export async function persistDiscoveredModel(model: AiModel): Promise<void> {
  if (!model.live || CURATED_IDS.has(model.id)) return;
  const ref = getFirestore().collection(AI_SETTINGS_COLLECTION).doc(DISCOVERED_MODELS_DOC);
  await ref.set(
    {
      models: {
        [model.id]: {
          id: model.id,
          provider: model.provider,
          label: model.label,
          discoveredAt: new Date().toISOString(),
        },
      },
    },
    { merge: true },
  );
  registerDiscoveredModels([model]);
  persistedLoadedAt = Date.now();
}
