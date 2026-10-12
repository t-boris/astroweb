import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { callClaudeRaw, extractJson, usageCostUsd } from "./claudeRaw";

/**
 * Fresh-news digest via web_search on a cheap model (Sonnet 4.6), keyed on the
 * user's interest tags + current residence. Kept on the cheap model so the ~30k
 * retrieved tokens are billed at $3/MTok, not Opus rates. Cached per (tags, day,
 * region) to dedupe across users. (Validated COGS ≈ $0.09.)
 */

const DIGEST_MODEL = "claude-sonnet-4-6";

export interface NewsHook {
  headline: string;
  oneLine: string;
}
export interface NewsDigest {
  hooks: NewsHook[];
  note: string;
  costUsd: number;
}

function cacheKey(tags: string[], residence: string, date: string): string {
  const raw = `${date}__${residence}__${[...tags].sort().join("-")}`;
  return raw.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 480) || "default";
}

export async function buildNewsDigest(params: {
  interestTags: string[];
  residence: string;
  language: "ru" | "en";
  date: string;
}): Promise<NewsDigest> {
  const { interestTags, residence, language, date } = params;
  const db = getFirestore();
  const ref = db.collection("newsCache").doc(cacheKey(interestTags, residence, date));

  const cached = await ref.get();
  if (cached.exists) {
    const d = cached.data() as NewsDigest;
    return { ...d, costUsd: 0 };
  }

  const system =
    (language === "ru"
      ? "Ты — news scout. Через web_search найди 2-3 СВЕЖИЕ (последние дни) новости по интересам и региону. "
      : "You are a news scout. Use web_search to find 2-3 FRESH (last few days) news items for the interests and region. ") +
    'Return ONLY JSON: {"hooks":[{"headline":string,"oneLine":string}],"note":string}. oneLine <= 25 words. Do not narrate.';

  const user = `Interests: ${interestTags.join(", ") || "general"}. Region: ${residence}. Date: ${date}.`;

  try {
    const res = await callClaudeRaw({
      model: DIGEST_MODEL,
      system,
      user,
      maxTokens: 1200,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
    });
    const parsed = extractJson<{ hooks?: NewsHook[]; note?: string }>(res.text);
    const digest: NewsDigest = {
      hooks: Array.isArray(parsed.hooks) ? parsed.hooks.slice(0, 3) : [],
      note: typeof parsed.note === "string" ? parsed.note : "",
      costUsd: usageCostUsd(DIGEST_MODEL, res.usage),
    };
    // Cache without the per-call cost.
    await ref.set({ hooks: digest.hooks, note: digest.note, createdAt: new Date().toISOString() });
    return digest;
  } catch (err) {
    logger.warn("buildNewsDigest failed — proceeding without news", { error: (err as Error).message });
    return { hooks: [], note: "", costUsd: 0 };
  }
}
