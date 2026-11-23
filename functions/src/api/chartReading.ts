import { createHash, randomUUID } from "crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { FieldValue, getFirestore, type DocumentReference, type Transaction } from "firebase-admin/firestore";
import { computeNatalChart } from "../astro/chart";
import { localBirthData, solveBirth } from "../astro/chartSolver";
import { AI_SECRETS } from "../services/ai/keys";
import { extractJson } from "../services/ai/json";
import { AiRefusalError, type PromptImage } from "../services/ai/providers/types";
import { runTask } from "../services/ai/run";
import { loadTaskSettings, textsFor } from "../services/ai/settings";
import {
  describeRecoveredBirth,
  normalizeChartReading,
  solverInput,
  withVerdicts,
  type NormalizedReading,
} from "../services/chartReading";
import { requireAccount } from "../services/owner";
import { buildChartImageReadingPrompt, buildChartPortraitPrompt, normalizeLanguage } from "../services/prompts";
import { TOKEN_COST } from "../services/tokens";
import { refundInTx, spendInTx } from "../services/wallet";
import { DEFAULT_HOUSE_SYSTEM } from "../vendor/chart-core";
import type { ChartPictureReading, ChartPortraitResult, ChartReadingResult, ChartResult, RecoveredBirth } from "../types";

/**
 * Explain my natal chart: a signed-in user uploads a chart picture; one star pays for reading it,
 * recovering the birth and the story. The picture itself is never stored: the reading is kept under
 * the picture's hash, so the same picture again costs nothing. The star is refunded when no birth
 * can be recovered or the AI fails.
 *
 * Each attempt has an id; the result, the refund and the release of its daily slot are written only
 * while the reading still belongs to that attempt, in one transaction with the wallet.
 */

const COLLECTION = "chartReadings";
const LIMITS = "chartReadingLimits";
/** Base64 characters of the largest accepted picture: Anthropic's 5 MB per picture (about 3.9 MB of image). */
export const MAX_IMAGE_BASE64 = 5 * 1024 * 1024;
/** The function deadline: the provider gives up after 180 s, which leaves time to refund. */
const FUNCTION_TIMEOUT_SECONDS = 300;
/** An attempt older than the function deadline is dead and may be taken over. */
const ATTEMPT_STALE_MS = 6 * 60_000;
/**
 * Unfinished attempts a user may have per UTC day: those running, and those refunded because of the
 * picture (no birth in it, or the model refused it). Each refunded one is an AI call nobody pays for.
 */
export const MAX_OPEN_READINGS_PER_DAY = 10;
/** Story attempts per reading, language and UTC day. */
export const MAX_STORY_ATTEMPTS_PER_DAY = 5;
const MAX_PLACE_NAME = 120;
const READING_ID = /^[A-Za-z0-9]+_[0-9a-f]{64}$/;

type Language = "en" | "ru";

export type ChartNotReadReason =
  | "unreadable"
  | "not_a_chart"
  | "sidereal"
  /** ASC or MC not on the picture: no place, so no local time (owner's choice: refuse, DEC-004). */
  | "missing_angles"
  /** No Moon: no time of day, so no place. */
  | "missing_moon"
  | "missing_sun"
  | "too_few_points"
  | "no_consistent_moment"
  /** The angles do not give a place (or the place has no time zone). */
  | "no_place";

class ChartNotReadError extends Error {
  constructor(readonly reason: ChartNotReadReason) {
    super(`Chart not read: ${reason}`);
  }
}

// ---- The uploaded picture ---------------------------------------------------------

/** The picture type from its first bytes; the type the client claims is not trusted. */
function sniffMediaType(bytes: Buffer): PromptImage["mediaType"] | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

/**
 * The uploaded picture checked: base64 (a data-URL prefix is allowed), at most MAX_IMAGE_BASE64, JPEG, PNG or
 * WebP by its bytes. The model gets the canonical base64 of exactly the bytes that were checked and hashed.
 */
export function parseChartImage(value: unknown): { image: PromptImage; hash: string } {
  if (typeof value !== "string" || value.length === 0) throw new HttpsError("invalid-argument", "image is required");
  const data = value.replace(/^data:image\/[a-z+.-]+;base64,/i, "");
  if (data.length > MAX_IMAGE_BASE64) throw new HttpsError("invalid-argument", "IMAGE_TOO_LARGE");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new HttpsError("invalid-argument", "image must be base64");
  const bytes = Buffer.from(data, "base64");
  const mediaType = sniffMediaType(bytes);
  if (!mediaType) throw new HttpsError("invalid-argument", "UNSUPPORTED_IMAGE");
  return { image: { mediaType, data: bytes.toString("base64") }, hash: createHash("sha256").update(bytes).digest("hex") };
}

// ---- Stored state -------------------------------------------------------------------

interface StoredReading {
  uid: string;
  status: "pending" | "ready" | "failed";
  attemptId?: string;
  startedAtMs: number;
  /** The star of the current attempt is spent and not refunded. */
  charged?: boolean;
  reading?: ChartPictureReading;
  birth?: RecoveredBirth;
  chart?: ChartResult;
  failureReason?: string;
  stories?: Partial<Record<Language, string>>;
  storyStartedAtMs?: Partial<Record<Language, number>>;
  storyAttempts?: Partial<Record<Language, { day: string; count: number }>>;
}

type ReadyReading = StoredReading & { reading: ChartPictureReading; birth: RecoveredBirth; chart: ChartResult };

function isReady(doc: StoredReading | undefined): doc is ReadyReading {
  return doc?.status === "ready" && Boolean(doc.reading && doc.birth && doc.chart);
}

interface DailyLimit {
  day?: string;
  open?: number;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function openToday(limit: DailyLimit | undefined, today: string): number {
  return limit?.day === today ? limit.open ?? 0 : 0;
}

/** Give back the daily slot an attempt took (it succeeded, or failed through no fault of the picture). */
function releaseSlotInTx(tx: Transaction, limitRef: DocumentReference, limit: DailyLimit | undefined, today: string): void {
  if (limit?.day === today) tx.set(limitRef, { day: today, open: Math.max(0, (limit.open ?? 0) - 1) });
}

// ---- Reading: claim, solve, finish ------------------------------------------------

interface Refs {
  ref: DocumentReference;
  limitRef: DocumentReference;
  uid: string;
  today: string;
}

type Claim = { kind: "cached"; doc: ReadyReading } | { kind: "claimed"; attemptId: string };

/**
 * One transaction: an earlier reading of the picture is returned as it is; otherwise the attempt takes a
 * daily slot and the star (or the unrefunded star of a dead attempt on the same picture) and claims the reading.
 */
async function claimReading({ ref, limitRef, uid, today }: Refs, hash: string): Promise<Claim> {
  return getFirestore().runTransaction(async (tx) => {
    const [snap, limitSnap] = await Promise.all([tx.get(ref), tx.get(limitRef)]);
    const existing = snap.data() as StoredReading | undefined;
    if (isReady(existing)) return { kind: "cached", doc: existing };
    if (existing?.status === "pending" && Date.now() - existing.startedAtMs < ATTEMPT_STALE_MS) {
      throw new HttpsError("aborted", "READING_IN_PROGRESS");
    }
    const limit = limitSnap.data() as DailyLimit | undefined;
    const open = openToday(limit, today);
    if (open >= MAX_OPEN_READINGS_PER_DAY) throw new HttpsError("resource-exhausted", "TOO_MANY_FAILED_READINGS");
    const heldByDeadAttempt = existing?.status === "pending" && existing.charged === true;
    // Throws failed-precondition "INSUFFICIENT_TOKENS" before anything is written.
    if (!heldByDeadAttempt) await spendInTx(tx, uid, TOKEN_COST.chartReading, "chart_reading");
    const attemptId = randomUUID();
    tx.set(ref, {
      uid,
      imageHash: hash,
      status: "pending",
      attemptId,
      startedAtMs: Date.now(),
      charged: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(limitRef, { day: today, open: open + 1 });
    return { kind: "claimed", attemptId };
  });
}

interface Solved {
  reading: ChartPictureReading;
  birth: RecoveredBirth;
  chart: ChartResult;
  model: string;
  costUsd: number;
}

function publicReading(reading: NormalizedReading): ChartPictureReading {
  return { zodiac: reading.zodiac, points: reading.points, asc: reading.asc, mc: reading.mc, notes: reading.notes };
}

/** Vision reading, solving and the chart of the recovered birth. Throws ChartNotReadError when no birth comes out. */
async function readAndSolve(image: PromptImage): Promise<Solved> {
  const settings = await loadTaskSettings("chartImageReading");
  const result = await runTask(settings, buildChartImageReadingPrompt({ image, texts: textsFor(settings, "en") }));
  let raw: unknown;
  try {
    raw = extractJson(result.text);
  } catch {
    throw new ChartNotReadError("unreadable");
  }
  const normalized = normalizeChartReading(raw);
  if (!normalized.isNatalChart) throw new ChartNotReadError("not_a_chart");
  // The solver works in the tropical zodiac; a sidereal chart is shifted by an ayanamsa the picture rarely names.
  if (normalized.zodiac === "sidereal") throw new ChartNotReadError("sidereal");
  // Without the angles there is no place and so no local clock; a chart drawn anyway would contradict the picture.
  if (!normalized.asc || !normalized.mc) throw new ChartNotReadError("missing_angles");
  if (!normalized.points.some((p) => p.id === "Moon")) throw new ChartNotReadError("missing_moon");

  const solved = solveBirth(solverInput(normalized));
  if (solved.status === "no_match" || !solved.utc) throw new ChartNotReadError(solved.reason ?? "no_consistent_moment");
  const local = localBirthData(solved);
  if (
    !local?.birthTime ||
    !local.timezone ||
    solved.lat === null ||
    solved.lng === null ||
    solved.timeAccuracyMinutes === null ||
    solved.placeAccuracyKm === null
  ) {
    throw new ChartNotReadError("no_place");
  }
  const birth: RecoveredBirth = {
    status: solved.status,
    birthDate: local.birthDate,
    birthTime: local.birthTime,
    timezone: local.timezone,
    utc: solved.utc,
    lat: solved.lat,
    lng: solved.lng,
    timeAccuracyMinutes: solved.timeAccuracyMinutes,
    placeAccuracyKm: solved.placeAccuracyKm,
  };
  const chart = computeNatalChart({
    birthDate: birth.birthDate,
    birthTime: birth.birthTime,
    timeUnknown: false,
    lat: birth.lat,
    lng: birth.lng,
    timezone: birth.timezone,
    houseSystem: DEFAULT_HOUSE_SYSTEM,
  });
  return { reading: publicReading(withVerdicts(normalized, solved)), birth, chart, model: result.model, costUsd: result.costUsd };
}

/** Store the result if the reading still belongs to this attempt; the star stays spent. */
async function finishReady({ ref, limitRef, today }: Refs, attemptId: string, out: Solved): Promise<boolean> {
  return getFirestore().runTransaction(async (tx) => {
    const [snap, limitSnap] = await Promise.all([tx.get(ref), tx.get(limitRef)]);
    if ((snap.data() as StoredReading | undefined)?.attemptId !== attemptId) return false;
    tx.set(
      ref,
      {
        status: "ready",
        charged: false,
        reading: out.reading,
        birth: out.birth,
        chart: out.chart,
        model: out.model,
        costUsd: out.costUsd,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    releaseSlotInTx(tx, limitRef, limitSnap.data() as DailyLimit | undefined, today);
    return true;
  });
}

/**
 * Refund the attempt's star and mark the reading failed, together, if the reading still belongs to this
 * attempt. A failure caused by the picture keeps its daily slot taken; any other failure gives it back.
 */
async function finishFailed({ ref, limitRef, uid, today }: Refs, attemptId: string, reason: string, keepSlot: boolean) {
  const attempt = () =>
    getFirestore().runTransaction(async (tx) => {
      const [snap, limitSnap] = await Promise.all([tx.get(ref), tx.get(limitRef)]);
      const doc = snap.data() as StoredReading | undefined;
      if (doc?.attemptId !== attemptId || doc.charged !== true) return;
      await refundInTx(tx, uid, TOKEN_COST.chartReading, "chart_reading");
      tx.set(ref, { status: "failed", charged: false, failureReason: reason, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (!keepSlot) releaseSlotInTx(tx, limitRef, limitSnap.data() as DailyLimit | undefined, today);
    });
  try {
    await attempt();
  } catch (first) {
    logger.warn("readChartImage refund failed once, retrying", { readingId: ref.id, error: (first as Error).message });
    try {
      await attempt();
    } catch (second) {
      // The reading stays pending and charged: the next attempt on the same picture takes over that star.
      logger.error("readChartImage could not refund", { readingId: ref.id, error: (second as Error).message });
    }
  }
}

function resultOf(readingId: string, doc: Pick<ReadyReading, "reading" | "birth" | "chart">, charged: boolean): ChartReadingResult {
  return { readingId, birth: doc.birth, reading: doc.reading, chart: doc.chart, charged };
}

export const readChartImage = onCall(
  { secrets: AI_SECRETS, timeoutSeconds: FUNCTION_TIMEOUT_SECONDS, memory: "512MiB" },
  async (request) => {
    // Paid action: account only (DEC-001). Checked before anything else.
    const uid = requireAccount(request);
    const { image, hash } = parseChartImage(request.data?.image);
    const db = getFirestore();
    const refs: Refs = {
      ref: db.collection(COLLECTION).doc(`${uid}_${hash}`),
      limitRef: db.collection(LIMITS).doc(uid),
      uid,
      today: todayUtc(),
    };
    const readingId = refs.ref.id;

    const claim = await claimReading(refs, hash);
    if (claim.kind === "cached") return resultOf(readingId, claim.doc, false);

    let out: Solved;
    try {
      out = await readAndSolve(image);
    } catch (error) {
      const reason = error instanceof ChartNotReadError ? error.reason : error instanceof AiRefusalError ? "refused" : "error";
      // The picture is to blame when no birth comes out of it or the model refuses it.
      await finishFailed(refs, claim.attemptId, reason, reason !== "error");
      if (error instanceof ChartNotReadError) {
        logger.info("readChartImage found no birth", { readingId, reason });
        throw new HttpsError("failed-precondition", "CHART_NOT_READ", { reason });
      }
      logger.error("readChartImage failed", { readingId, reason, error: (error as Error).message });
      throw new HttpsError("internal", "CHART_READING_FAILED");
    }

    if (!(await finishReady(refs, claim.attemptId, out))) {
      logger.warn("readChartImage attempt was taken over before it finished", { readingId });
      throw new HttpsError("aborted", "READING_IN_PROGRESS");
    }
    logger.info("readChartImage recovered a birth", {
      readingId,
      status: out.birth.status,
      timeAccuracyMinutes: out.birth.timeAccuracyMinutes,
      placeAccuracyKm: out.birth.placeAccuracyKm,
      model: out.model,
      costUsd: out.costUsd,
    });
    return resultOf(readingId, out, true);
  },
);

// ---- Story ---------------------------------------------------------------------------

/** Claim a story attempt for one language, or return the reading when its story is already written. */
async function claimStory(ref: DocumentReference, uid: string, language: Language, today: string): Promise<ReadyReading> {
  return getFirestore().runTransaction(async (tx) => {
    const doc = (await tx.get(ref)).data() as StoredReading | undefined;
    // Someone else's reading looks the same as a missing one.
    if (!doc || doc.uid !== uid || !isReady(doc)) throw new HttpsError("not-found", "Reading not found");
    if (doc.stories?.[language]) return doc;
    if (Date.now() - (doc.storyStartedAtMs?.[language] ?? 0) < ATTEMPT_STALE_MS) {
      throw new HttpsError("aborted", "STORY_IN_PROGRESS");
    }
    const tried = doc.storyAttempts?.[language];
    const count = tried?.day === today ? tried.count : 0;
    if (count >= MAX_STORY_ATTEMPTS_PER_DAY) throw new HttpsError("resource-exhausted", "TOO_MANY_STORY_ATTEMPTS");
    // Nested maps merge field by field, so the other language's lock and count are left alone.
    tx.set(
      ref,
      { storyStartedAtMs: { [language]: Date.now() }, storyAttempts: { [language]: { day: today, count: count + 1 } } },
      { merge: true },
    );
    return doc;
  });
}

/**
 * The story about the person behind a reading, per language; generated once and kept with the reading.
 * The page sends the place name (from reverse geocoding) with the first request: the story keeps the
 * name it was written with.
 */
export const describeChartReading = onCall({ secrets: AI_SECRETS, timeoutSeconds: FUNCTION_TIMEOUT_SECONDS }, async (request) => {
  const uid = requireAccount(request);
  const readingId = request.data?.readingId;
  if (typeof readingId !== "string" || !READING_ID.test(readingId)) {
    throw new HttpsError("invalid-argument", "readingId is required");
  }
  if (!readingId.startsWith(`${uid}_`)) throw new HttpsError("not-found", "Reading not found");
  const language = normalizeLanguage(request.data?.language);
  const rawPlace = request.data?.placeName;
  const placeName = typeof rawPlace === "string" ? rawPlace.trim().slice(0, MAX_PLACE_NAME) : null;
  const ref = getFirestore().collection(COLLECTION).doc(readingId);

  const stored = await claimStory(ref, uid, language, todayUtc());
  const done = (text: string): ChartPortraitResult => ({ readingId, language, text });
  const written = stored.stories?.[language];
  if (written) return done(written);

  try {
    const settings = await loadTaskSettings("chartPortrait");
    const result = await runTask(
      settings,
      buildChartPortraitPrompt({
        chart: stored.chart,
        birth: describeRecoveredBirth(stored.birth, placeName, language),
        language,
        texts: textsFor(settings, language),
      }),
    );
    const text = result.text.trim();
    if (!text) throw new Error("empty story");
    await ref.set(
      { stories: { [language]: text }, storyStartedAtMs: { [language]: 0 }, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    logger.info("describeChartReading wrote a story", { readingId, language, model: result.model, costUsd: result.costUsd });
    return done(text);
  } catch (error) {
    await ref.set({ storyStartedAtMs: { [language]: 0 } }, { merge: true }).catch(() => undefined);
    logger.error("describeChartReading failed", { readingId, language, error: (error as Error).message });
    throw new HttpsError("internal", "STORY_FAILED");
  }
});
