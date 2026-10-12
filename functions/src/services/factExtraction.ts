import { logger } from "firebase-functions/v2";
import { generateClaudeText } from "./anthropic";
import { appendFact } from "./dossier";

const EXTRACTION_MODEL = "claude-haiku-4-5"; // cheap background pass

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
    const responseText = await generateClaudeText(
      {
        model: EXTRACTION_MODEL,
        temperature: 0,
        maxOutputTokens: 500,
        systemInstruction:
          "You extract durable personal facts from a user's astrology question. Return ONLY a JSON array " +
          '(can be empty) of objects: {"key":string,"value":string,"sensitive":boolean,"confidence":0..1}. ' +
          "Keys are canonical camelCase (e.g. occupation, relationshipStatus, hasKids, goals, interests, openLoops, location). " +
          "Mark sensitive=true for relationship/health/orientation/religion. Only durable facts about the person, not the question itself. No narration.",
        userPrompt: text.slice(0, 2000),
      },
      { sanitizeOutput: false },
    );
    const facts = parseJsonArray(responseText).slice(0, 6);
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
