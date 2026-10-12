import { createHash } from "node:crypto";
import { HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Server-side storage of the per-profile content a user generated or paid for
 * (REQ-002..005, REQ-007, REQ-009; DEC-005):
 *
 *   deepTexts/{profileId}/items/{sha(blockKey)}            one text per interpretation block
 *   compatibilityReadings/{profileId}/items/{contentHash}   paid compatibility readings
 *   oracleHistory/{profileId}/items/{id}                    Oracle Q/A (already existed)
 *
 * Everything is reached only through callables that first check profile
 * ownership; the Firestore rules deny all direct client access.
 */

export const LIMITS = {
  deepTexts: 400,
  oracleEntries: 200,
  compatibilityReadings: 200,
  deepTextChars: 30_000,
  answerChars: 60_000,
  questionChars: 1_000,
  nameChars: 100,
  placeChars: 200,
  blockKeyChars: 200,
  /** Whole upload payload, in characters of its JSON. */
  payloadChars: 2_500_000,
  /** How many items a read returns per kind. */
  readOracle: 200,
  readCompat: 500,
} as const;

export type ContentLanguage = "en" | "ru";

export interface DeepTextInput {
  blockKey: string;
  text: string;
  language: ContentLanguage;
}

export interface CompatReadingInput {
  partnerName: string;
  partnerBirthDate: string;
  partnerBirthPlace: string;
  answer: string;
  partnerTimezone: string | null;
  generatedAt: string;
}

export interface OracleEntryInput {
  question: string;
  answer: string;
  model: string;
  askedAt: string;
}

export interface UploadPayload {
  deepTexts: DeepTextInput[];
  compatibilityReadings: CompatReadingInput[];
  oracleHistory: OracleEntryInput[];
}

export interface ProfileContent {
  deepTexts: Record<string, { text: string; language: string }>;
  compatibilityReadings: Array<CompatReadingInput & { id: string }>;
  oracleHistory: Array<OracleEntryInput & { id: string; channel: string }>;
}

export interface UploadResult {
  deepTexts: { added: number; skipped: number };
  compatibilityReadings: { added: number; skipped: number };
  oracleHistory: { added: number; skipped: number };
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const collapse = (s: string) => s.replace(/\s+/g, " ").trim();
const stripArtifacts = (s: string) => s.replace(/\[END_OF_REPORT\]/g, "").replace(/\*Continuation:\*\s*/gi, "");

/** Deterministic document id of a deep text: one per interpretation block. */
export function deepTextId(blockKey: string): string {
  return sha(`deep|${blockKey}`).slice(0, 40);
}

/** Deterministic document id of a compatibility reading from what it says. */
export function compatReadingId(r: Pick<CompatReadingInput, "partnerName" | "partnerBirthDate" | "partnerBirthPlace" | "answer">): string {
  return sha(`compat|${collapse(r.partnerName)}|${r.partnerBirthDate}|${collapse(r.partnerBirthPlace)}|${collapse(stripArtifacts(r.answer))}`).slice(0, 40);
}

/**
 * Identity of an Oracle entry across devices and across the server's own copy:
 * the question plus the start of the answer, whitespace-normalised and without
 * generation artifacts, so a locally cleaned answer matches the server's raw one.
 */
export function oracleEntryKey(question: string, answer: string): string {
  return sha(`oracle|${collapse(question)}|${collapse(stripArtifacts(answer)).slice(0, 300)}`).slice(0, 40);
}

const db = () => getFirestore();
const deepRef = (profileId: string) => db().collection("deepTexts").doc(profileId).collection("items");
const compatRef = (profileId: string) => db().collection("compatibilityReadings").doc(profileId).collection("items");
const oracleRef = (profileId: string) => db().collection("oracleHistory").doc(profileId).collection("items");

const isoOrNow = (v: unknown): string => {
  if (typeof v === "string" && !Number.isNaN(Date.parse(v))) return new Date(v).toISOString();
  return new Date().toISOString();
};

const lang = (v: unknown): ContentLanguage => (v === "ru" ? "ru" : "en");

/* ------------------------------------------------------------------ writes */

/** Store (or replace) the deep text of one interpretation block. */
export async function saveDeepText(profileId: string, input: DeepTextInput & { model?: string | null }): Promise<void> {
  await deepRef(profileId).doc(deepTextId(input.blockKey)).set({
    blockKey: input.blockKey,
    text: input.text,
    language: input.language,
    model: input.model ?? null,
    createdAt: new Date().toISOString(),
  });
}

/** Store a paid compatibility reading; returns its id. Re-saving identical content is a no-op overwrite. */
export async function saveCompatReading(profileId: string, input: CompatReadingInput & { model?: string | null }): Promise<string> {
  const id = compatReadingId(input);
  await compatRef(profileId).doc(id).set({
    partnerName: input.partnerName,
    partnerBirthDate: input.partnerBirthDate,
    partnerBirthPlace: input.partnerBirthPlace,
    answer: input.answer,
    partnerTimezone: input.partnerTimezone,
    generatedAt: input.generatedAt,
    model: input.model ?? null,
  });
  return id;
}

/* ------------------------------------------------------------------- reads */

export async function readProfileContent(profileId: string): Promise<ProfileContent> {
  const [deep, compat, oracle] = await Promise.all([
    deepRef(profileId).get(),
    compatRef(profileId).orderBy("generatedAt", "desc").limit(LIMITS.readCompat).get(),
    oracleRef(profileId).orderBy("askedAt", "desc").limit(LIMITS.readOracle).get(),
  ]);

  const deepTexts: ProfileContent["deepTexts"] = {};
  deep.docs.forEach((d) => {
    const x = d.data();
    if (typeof x.blockKey === "string" && typeof x.text === "string") {
      deepTexts[x.blockKey] = { text: x.text, language: typeof x.language === "string" ? x.language : "en" };
    }
  });

  return {
    deepTexts,
    compatibilityReadings: compat.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        partnerName: String(x.partnerName ?? ""),
        partnerBirthDate: String(x.partnerBirthDate ?? ""),
        partnerBirthPlace: String(x.partnerBirthPlace ?? ""),
        answer: String(x.answer ?? ""),
        partnerTimezone: typeof x.partnerTimezone === "string" ? x.partnerTimezone : null,
        generatedAt: String(x.generatedAt ?? ""),
      };
    }),
    oracleHistory: oracle.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        question: String(x.question ?? ""),
        answer: String(x.answer ?? ""),
        model: String(x.model ?? ""),
        askedAt: String(x.askedAt ?? ""),
        channel: String(x.channel ?? "web"),
      };
    }),
  };
}

/* ----------------------------------------------------------------- deletes */

async function deleteAll(col: ReturnType<typeof deepRef>): Promise<number> {
  const snap = await col.get();
  let removed = 0;
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db().batch();
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
    removed += Math.min(400, snap.docs.length - i);
  }
  return removed;
}

/** DEC-007: everything stored for a profile goes away with the profile. */
export async function deleteAllProfileContent(profileId: string): Promise<{ deepTexts: number; compatibilityReadings: number; oracleHistory: number }> {
  const [deepTexts, compatibilityReadings, oracleHistory] = await Promise.all([
    deleteAll(deepRef(profileId)),
    deleteAll(compatRef(profileId)),
    deleteAll(oracleRef(profileId)),
  ]);
  return { deepTexts, compatibilityReadings, oracleHistory };
}

/** DEC-008: remove one Oracle entry or one compatibility reading of this profile. */
export async function deleteContentItem(profileId: string, kind: "oracle" | "compatibility", id: string): Promise<boolean> {
  const ref = (kind === "oracle" ? oracleRef(profileId) : compatRef(profileId)).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return false;
  await ref.delete();
  return true;
}

/* ------------------------------------------------------------------ upload */

const bad = (msg: string): never => {
  throw new HttpsError("invalid-argument", msg);
};

const str = (v: unknown, max: number, what: string): string => {
  if (typeof v !== "string") return bad(`${what} must be a string`);
  const s = v.trim();
  if (!s || s.length > max) return bad(`${what} is empty or too long`);
  return s;
};

const arr = (v: unknown, max: number, what: string): unknown[] => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return bad(`${what} must be a list`);
  if (v.length > max) return bad(`${what} has too many entries`);
  return v;
};

/** Validate and normalise an upload request. Throws invalid-argument on anything unexpected. */
export function sanitizeUploadPayload(raw: unknown): UploadPayload {
  if (!raw || typeof raw !== "object") return bad("payload is required");
  if (JSON.stringify(raw).length > LIMITS.payloadChars) return bad("payload is too large");
  const r = raw as Record<string, unknown>;

  const deepTexts = arr(r.deepTexts, LIMITS.deepTexts, "deepTexts").map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return {
      blockKey: str(o.blockKey, LIMITS.blockKeyChars, "blockKey"),
      text: str(o.text, LIMITS.deepTextChars, "deep text"),
      language: lang(o.language),
    };
  });

  const compatibilityReadings = arr(r.compatibilityReadings, LIMITS.compatibilityReadings, "compatibilityReadings").map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return {
      partnerName: str(o.partnerName, LIMITS.nameChars, "partnerName"),
      partnerBirthDate: str(o.partnerBirthDate, 10, "partnerBirthDate"),
      partnerBirthPlace: str(o.partnerBirthPlace, LIMITS.placeChars, "partnerBirthPlace"),
      answer: str(o.answer, LIMITS.answerChars, "answer"),
      partnerTimezone: typeof o.partnerTimezone === "string" ? o.partnerTimezone.slice(0, 64) : null,
      generatedAt: isoOrNow(o.generatedAt),
    };
  });

  const oracleHistory = arr(r.oracleHistory, LIMITS.oracleEntries, "oracleHistory").map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return {
      question: str(o.question, LIMITS.questionChars, "question"),
      answer: str(o.answer, LIMITS.answerChars, "answer"),
      model: typeof o.model === "string" ? o.model.slice(0, 100) : "",
      askedAt: isoOrNow(o.askedAt),
    };
  });

  return { deepTexts, compatibilityReadings, oracleHistory };
}

/**
 * One-time import of content that existed only in a browser (DEC-002). It is
 * idempotent and never overwrites anything already on the server: deep texts
 * and readings are skipped when their id exists, Oracle entries when an entry
 * with the same identity exists. It touches only the three content collections:
 * no wallets, no unlock flags (REQ-007).
 */
export async function importLocalContent(profileId: string, payload: UploadPayload): Promise<UploadResult> {
  const result: UploadResult = {
    deepTexts: { added: 0, skipped: 0 },
    compatibilityReadings: { added: 0, skipped: 0 },
    oracleHistory: { added: 0, skipped: 0 },
  };

  // Deep texts: one per block; the first one in the payload wins within a request.
  const deepById = new Map<string, DeepTextInput>();
  payload.deepTexts.forEach((d) => {
    const id = deepTextId(d.blockKey);
    if (!deepById.has(id)) deepById.set(id, d);
  });
  result.deepTexts.skipped += payload.deepTexts.length - deepById.size;
  const deepExisting = deepById.size ? await db().getAll(...[...deepById.keys()].map((id) => deepRef(profileId).doc(id))) : [];
  const deepIds = [...deepById.keys()];
  for (let i = 0; i < deepIds.length; i += 1) {
    if (deepExisting[i].exists) {
      result.deepTexts.skipped += 1;
      continue;
    }
    const d = deepById.get(deepIds[i]) as DeepTextInput;
    await deepRef(profileId).doc(deepIds[i]).set({
      blockKey: d.blockKey,
      text: d.text,
      language: d.language,
      model: null,
      createdAt: new Date().toISOString(),
      source: "upload",
    });
    result.deepTexts.added += 1;
  }

  // Compatibility readings: id derives from the content.
  const compatById = new Map<string, CompatReadingInput>();
  payload.compatibilityReadings.forEach((c) => {
    const id = compatReadingId(c);
    if (!compatById.has(id)) compatById.set(id, c);
  });
  result.compatibilityReadings.skipped += payload.compatibilityReadings.length - compatById.size;
  const compatIds = [...compatById.keys()];
  const compatExisting = compatIds.length ? await db().getAll(...compatIds.map((id) => compatRef(profileId).doc(id))) : [];
  for (let i = 0; i < compatIds.length; i += 1) {
    if (compatExisting[i].exists) {
      result.compatibilityReadings.skipped += 1;
      continue;
    }
    const c = compatById.get(compatIds[i]) as CompatReadingInput;
    await compatRef(profileId).doc(compatIds[i]).set({ ...c, model: null, source: "upload" });
    result.compatibilityReadings.added += 1;
  }

  // Oracle history: compare with every entry already stored (the server's own
  // copies have random ids), then write new ones under their identity key.
  const existing = await oracleRef(profileId).get();
  const seen = new Set<string>();
  existing.docs.forEach((d) => {
    const x = d.data();
    seen.add(oracleEntryKey(String(x.question ?? ""), String(x.answer ?? "")));
  });
  for (const e of payload.oracleHistory) {
    const key = oracleEntryKey(e.question, e.answer);
    if (seen.has(key)) {
      result.oracleHistory.skipped += 1;
      continue;
    }
    seen.add(key);
    await oracleRef(profileId).doc(key).set({
      question: e.question,
      answer: e.answer,
      model: e.model,
      channel: "web",
      askedAt: e.askedAt,
      source: "upload",
    });
    result.oracleHistory.added += 1;
  }

  return result;
}
