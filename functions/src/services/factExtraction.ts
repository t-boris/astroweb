import { logger } from "firebase-functions/v2";
import { buildFactExtractionPrompt } from "./prompts";
import type { GenerationResult } from "./ai/generate";
import { runTask } from "./ai/run";
import { loadTaskSettings, textsFor, type EffectiveTaskSettings } from "./ai/settings";
import { appendFact } from "./dossier";

export interface CandidateFact {
  key: string;
  value: string;
  sensitive: boolean;
  confidence: number;
}

const SENSITIVE_KEYS = new Set([
  "relationshipStatus",
  "hasKids",
  "health",
  "sexualOrientation",
  "religion",
  "mentalHealth",
]);

function parseJsonArray(text: string): CandidateFact[] {
  let t = text;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1];
  const i = t.indexOf("["), j = t.lastIndexOf("]");
  if (i < 0 || j <= i) return [];
  try {
    const arr = JSON.parse(t.slice(i, j + 1)) as CandidateFact[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Run the fact-extraction task on a question (task factExtraction). Throws on failure. */
export async function runFactExtraction(
  text: string,
  settings: EffectiveTaskSettings,
): Promise<{ facts: CandidateFact[]; result: GenerationResult }> {
  // The prompt texts of this task are the same for every language.
  const result = await runTask(settings, buildFactExtractionPrompt({ text, texts: textsFor(settings, "en") }));
  return { facts: parseJsonArray(result.text).slice(0, 6), result };
}

async function extractFacts(text: string): Promise<CandidateFact[]> {
  const { facts } = await runFactExtraction(text, await loadTaskSettings("factExtraction"));
  return facts;
}

/**
 * Background pass: infer dossier facts from a user's free-text question.
 * Non-sensitive facts are auto-appended (low confidence, user-undoable);
 * sensitive facts are appended unconfirmed (pending an explicit tap to confirm).
 * Best-effort — never throws into the caller.
 */
export async function extractAndStoreFacts(
  profileId: string,
  ownerUid: string,
  text: string,
  sourceRef: string | null,
): Promise<void> {
  try {
    const facts = await extractFacts(text);
    for (const f of facts) {
      if (!f?.key || !f?.value || typeof f.value !== "string") continue;
      const sensitive = Boolean(f.sensitive) || SENSITIVE_KEYS.has(f.key);
      await appendFact(profileId, ownerUid, {
        key: String(f.key).slice(0, 40),
        value: String(f.value).slice(0, 200),
        source: "inferred",
        sourceRef,
        sensitive,
        confirmed: !sensitive, // sensitive inferred facts stay pending an explicit confirm
        confidence: Math.min(1, Math.max(0, Number(f.confidence) || 0.5)),
      });
    }
  } catch (err) {
    logger.warn("extractAndStoreFacts failed", { profileId, error: (err as Error).message });
  }
}
