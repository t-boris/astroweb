import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { buildNewsDigestPrompt } from "./prompts";
import type { GenerationResult } from "./ai/generate";
import { extractJson } from "./ai/json";
import { runTask } from "./ai/run";
import { loadTaskSettings, textsFor, type EffectiveTaskSettings } from "./ai/settings";

/**
 * Fresh-news digest via the provider's web search (task newsDigest, DEC-016),
 * keyed on the user's interest tags + current residence. Defaults to a cheaper
 * model so the ~30k retrieved tokens are not billed at Opus rates. Cached per
 * (tags, day, region, settings) to dedupe across users.
 */

export interface NewsHook {
  headline: string;
  oneLine: string;
}
export interface NewsDigest {
  hooks: NewsHook[];
  note: string;
  costUsd: number;
}

export interface NewsDigestParams {
  interestTags: string[];
  residence: string;
  language: "ru" | "en";
  date: string;
}

function cacheKey(tags: string[], residence: string, date: string, settings: EffectiveTaskSettings): string {
  // The settings version is appended only when the task runs on non-default settings (DEC-004).
  const version = settings.version ? `__${settings.version}` : "";
  const raw = `${date}__${residence}__${[...tags].sort().join("-")}`;
  return (raw.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 480) || "default") + version;
}

/** One digest generation, without cache. Throws on failure. */
export async function generateNewsDigest(
  params: NewsDigestParams,
  settings: EffectiveTaskSettings,
): Promise<{ digest: NewsDigest; result: GenerationResult }> {
  const result = await runTask(
    settings,
    buildNewsDigestPrompt({ ...params, texts: textsFor(settings, params.language) }),
  );
  const parsed = extractJson<{ hooks?: NewsHook[]; note?: string }>(result.text);
  return {
    digest: {
      hooks: Array.isArray(parsed.hooks) ? parsed.hooks.slice(0, 3) : [],
      note: typeof parsed.note === "string" ? parsed.note : "",
      costUsd: result.costUsd,
    },
    result,
  };
}

/**
 * Digest for a letter, never failing the letter: on error it returns an empty
 * digest. `cache: "read"` (admin test runs) reads the cache but never writes it.
 */
export async function buildNewsDigest(
  params: NewsDigestParams,
  options: { cache?: "use" | "read"; settings?: EffectiveTaskSettings } = {},
): Promise<NewsDigest> {
  const settings = options.settings ?? (await loadTaskSettings("newsDigest"));
  const db = getFirestore();
  const ref = db.collection("newsCache").doc(cacheKey(params.interestTags, params.residence, params.date, settings));

  const cached = await ref.get();
  if (cached.exists) {
    const d = cached.data() as NewsDigest;
    return { ...d, costUsd: 0 };
  }

  try {
    const { digest } = await generateNewsDigest(params, settings);
    // Cache without the per-call cost.
    if (options.cache !== "read") {
      await ref.set({ hooks: digest.hooks, note: digest.note, createdAt: new Date().toISOString() });
    }
    return digest;
  } catch (err) {
    logger.warn("buildNewsDigest failed — proceeding without news", { error: (err as Error).message });
    return { hooks: [], note: "", costUsd: 0 };
  }
}
