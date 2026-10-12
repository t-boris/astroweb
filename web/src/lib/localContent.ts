/**
 * AI content that older versions kept only in this browser (REQ-007). Pure
 * functions over a Storage-like object, so they can be unit-tested.
 *
 *   astroweb:ai:v4:<profileId>     { deepTexts: { blockKey: text }, oracleHistory: [...] }
 *   astroweb:compat:v1:<profileId> [ compatibility readings ]
 *
 * For anonymous users these keys stay the place where content lives (DEC-004).
 * For a signed-in owner they are uploaded once and then cleared; afterwards they
 * only hold an entry whose server write failed, until the next upload.
 */
import type { UploadPayload } from "@/api/profileContent";

export interface LocalOracleEntry {
  question: string;
  answer: string;
  model: string;
  askedAt: string;
}

export interface LocalCompatEntry {
  partnerName: string;
  partnerBirthDate: string;
  partnerBirthPlace: string;
  answer: string;
  partnerTimezone: string | null;
  generatedAt: string;
}

export interface LocalContent {
  deepTexts: Record<string, string>;
  oracleHistory: LocalOracleEntry[];
  compatibilityReadings: LocalCompatEntry[];
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const aiKey = (profileId: string) => `astroweb:ai:v4:${profileId}`;
export const compatKey = (profileId: string) => `astroweb:compat:v1:${profileId}`;

/** Remove generation artifacts the same way the views always did. */
export function cleanAiArtifacts(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => {
      const n = line.trim().toLowerCase();
      return !(
        n.startsWith("of fragment to start from") ||
        n.startsWith("*continuation:*") ||
        n.startsWith("last generated fragment:") ||
        n.startsWith("continue the same answer")
      );
    })
    .join("\n")
    .replace(/\*Continuation:\*\s*/gi, "")
    .replace(/\[END_OF_REPORT\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const parse = (raw: string | null): unknown => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const isStr = (v: unknown): v is string => typeof v === "string";

export function readLocalContent(storage: StorageLike, profileId: string): LocalContent {
  let ai: Record<string, unknown> | null = null;
  let compat: unknown = null;
  try {
    ai = parse(storage.getItem(aiKey(profileId))) as Record<string, unknown> | null;
    compat = parse(storage.getItem(compatKey(profileId)));
  } catch {
    /* storage blocked */
  }

  const deepTexts: Record<string, string> = {};
  const rawDeep = ai && typeof ai.deepTexts === "object" && ai.deepTexts ? (ai.deepTexts as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(rawDeep)) {
    if (isStr(v) && v.trim()) deepTexts[k] = cleanAiArtifacts(v);
  }

  const oracleHistory = (Array.isArray(ai?.oracleHistory) ? (ai?.oracleHistory as unknown[]) : [])
    .filter((e): e is LocalOracleEntry => {
      const o = e as Record<string, unknown>;
      return !!o && isStr(o.question) && isStr(o.answer) && isStr(o.model) && isStr(o.askedAt);
    })
    .map((e) => ({ ...e, answer: cleanAiArtifacts(e.answer) }));

  const compatibilityReadings = (Array.isArray(compat) ? compat : []).filter((e): e is LocalCompatEntry => {
    const o = e as Record<string, unknown>;
    return !!o && isStr(o.partnerName) && isStr(o.partnerBirthDate) && isStr(o.partnerBirthPlace) && isStr(o.answer) && isStr(o.generatedAt);
  });

  return { deepTexts, oracleHistory, compatibilityReadings };
}

export function isEmpty(c: LocalContent): boolean {
  return Object.keys(c.deepTexts).length === 0 && c.oracleHistory.length === 0 && c.compatibilityReadings.length === 0;
}

/** Upload request for the local content, or null when there is nothing to upload. */
export function buildUploadPayload(c: LocalContent, language: string): UploadPayload | null {
  if (isEmpty(c)) return null;
  return {
    deepTexts: Object.entries(c.deepTexts).map(([blockKey, text]) => ({ blockKey, text, language })),
    oracleHistory: c.oracleHistory.map(({ question, answer, model, askedAt }) => ({ question, answer, model, askedAt })),
    compatibilityReadings: c.compatibilityReadings.map((r) => ({
      partnerName: r.partnerName,
      partnerBirthDate: r.partnerBirthDate,
      partnerBirthPlace: r.partnerBirthPlace,
      answer: r.answer,
      partnerTimezone: r.partnerTimezone ?? null,
      generatedAt: r.generatedAt,
    })),
  };
}

export function writeLocalContent(storage: StorageLike, profileId: string, c: LocalContent): void {
  try {
    if (Object.keys(c.deepTexts).length || c.oracleHistory.length) {
      storage.setItem(aiKey(profileId), JSON.stringify({ deepTexts: c.deepTexts, oracleHistory: c.oracleHistory }));
    } else {
      storage.removeItem(aiKey(profileId));
    }
    if (c.compatibilityReadings.length) {
      storage.setItem(compatKey(profileId), JSON.stringify(c.compatibilityReadings));
    } else {
      storage.removeItem(compatKey(profileId));
    }
  } catch {
    /* storage full or blocked */
  }
}

/** After a successful upload the content lives on the server: drop the local copy. */
export function clearLocalContent(storage: StorageLike, profileId: string): void {
  try {
    storage.removeItem(aiKey(profileId));
    storage.removeItem(compatKey(profileId));
  } catch {
    /* ignore */
  }
}

/** Keep a single item locally (server write failed); it is uploaded on the next open. */
export function keepLocally(
  storage: StorageLike,
  profileId: string,
  item: { deepText?: { blockKey: string; text: string }; oracle?: LocalOracleEntry; compat?: LocalCompatEntry },
): void {
  const c = readLocalContent(storage, profileId);
  if (item.deepText) c.deepTexts[item.deepText.blockKey] = item.deepText.text;
  if (item.oracle) c.oracleHistory = [item.oracle, ...c.oracleHistory];
  if (item.compat) c.compatibilityReadings = [item.compat, ...c.compatibilityReadings];
  writeLocalContent(storage, profileId, c);
}

/** Identity used to avoid showing an entry twice (local + server). */
export const oracleKey = (e: { question: string; answer: string }) =>
  `${e.question.replace(/\s+/g, " ").trim()}|${cleanAiArtifacts(e.answer).replace(/\s+/g, " ").slice(0, 300)}`;
export const compatKeyOf = (e: { partnerName: string; partnerBirthDate: string; answer: string }) =>
  `${e.partnerName.trim()}|${e.partnerBirthDate}|${cleanAiArtifacts(e.answer).replace(/\s+/g, " ").slice(0, 300)}`;
