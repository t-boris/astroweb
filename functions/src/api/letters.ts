import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";
import * as profileService from "../services/profile";
import { ownsProfile } from "../services/owner";
import { requireUid } from "../services/astrologer";
import { resolveOwnedChart } from "../services/chartResolver";
import {
  buildOraclePrompt,
  generateClaudeTextResult,
  normalizeLanguage,
} from "../services/anthropic";
import { spendFromWallet, refundToWallet } from "../services/wallet";
import { TOKEN_COST } from "../services/tokens";
import {
  getDossierSummaryText,
  recordOracleHistory,
  appendFact,
} from "../services/dossier";
import { extractAndStoreFacts } from "../services/factExtraction";

async function authorize(request: CallableRequest): Promise<{ uid: string; profileId: string; ownerDeviceId: string }> {
  const uid = requireUid(request);
  const profileId = request.data?.profileId;
  if (typeof profileId !== "string" || !profileId) throw new HttpsError("invalid-argument", "profileId is required");
  const profile = await profileService.getProfileById(profileId);
  if (!profile) throw new HttpsError("not-found", "Profile not found");
  if (!ownsProfile(profile, { uid, deviceId: null })) throw new HttpsError("permission-denied", "Access denied");
  return { uid, profileId, ownerDeviceId: profile.ownerDeviceId };
}

function lettersCol(profileId: string) {
  return getFirestore().collection("letters").doc(profileId).collection("items");
}

export const listLetters = onCall(async (request) => {
  const { profileId } = await authorize(request);
  const snap = await lettersCol(profileId).orderBy("generatedAt", "desc").limit(50).get();
  return { letters: snap.docs.map((d) => d.data()) };
});

export const getLetter = onCall(async (request) => {
  const { profileId } = await authorize(request);
  const letterId = request.data?.letterId;
  if (typeof letterId !== "string") throw new HttpsError("invalid-argument", "letterId is required");
  const snap = await lettersCol(profileId).doc(letterId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Letter not found");
  return { letter: snap.data() };
});

export const markLetterRead = onCall(async (request) => {
  const { profileId } = await authorize(request);
  const letterId = request.data?.letterId;
  if (typeof letterId !== "string") throw new HttpsError("invalid-argument", "letterId is required");
  await lettersCol(profileId).doc(letterId).set(
    { status: "read", delivery: { inApp: { readAt: new Date().toISOString() } } },
    { merge: true },
  );
  return { ok: true };
});

export const setLetterFeedback = onCall(async (request) => {
  const { profileId } = await authorize(request);
  const letterId = request.data?.letterId;
  const feedback = request.data?.feedback;
  if (typeof letterId !== "string" || (feedback !== "resonated" && feedback !== "missed")) {
    throw new HttpsError("invalid-argument", "letterId and feedback are required");
  }
  await lettersCol(profileId).doc(letterId).set({ feedback }, { merge: true });
  return { ok: true };
});

/** Tap-answer a letter question — free; writes the answer to the dossier. */
export const answerLetterQuestion = onCall(async (request) => {
  const { uid, profileId } = await authorize(request);
  const letterId = request.data?.letterId;
  const questionId = request.data?.questionId;
  const optionId = request.data?.optionId;
  if (typeof letterId !== "string" || typeof questionId !== "string" || typeof optionId !== "string") {
    throw new HttpsError("invalid-argument", "letterId, questionId, optionId are required");
  }
  const ref = lettersCol(profileId).doc(letterId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Letter not found");
  const letter = snap.data() as { questions?: { id: string; dossierKey: string; sensitive: boolean; options: string[] }[] };
  const q = letter.questions?.find((x) => x.id === questionId);
  if (!q) throw new HttpsError("not-found", "Question not found");

  await appendFact(profileId, uid, {
    key: q.dossierKey || "misc",
    value: optionId.slice(0, 200),
    source: "tap",
    sourceRef: letterId,
    sensitive: Boolean(q.sensitive),
    confirmed: true, // explicit tap is the confirmation
  });
  const questions = (letter.questions ?? []).map((x) =>
    x.id === questionId ? { ...x, answeredOption: optionId, answeredAt: new Date().toISOString() } : x,
  );
  await ref.set({ questions }, { merge: true });
  return { ok: true };
});

/** Free-text "ask a question" from inside a letter — costs ✦1, answered with the dossier. */
export const askInLetter = onCall(
  { timeoutSeconds: 180, secrets: ["ANTHROPIC_API_KEY"] },
  async (request) => {
    const { uid, profileId, ownerDeviceId } = await authorize(request);
    const question = request.data?.question;
    if (typeof question !== "string" || !question.trim()) {
      throw new HttpsError("invalid-argument", "question is required");
    }
    const trimmed = question.trim().slice(0, 1000);
    const language = normalizeLanguage(request.data?.language);

    await spendFromWallet(uid, TOKEN_COST.oracle);
    try {
      const { chart } = await resolveOwnedChart({ profileId, ownerDeviceId, uid });
      const dossierSummary = await getDossierSummaryText(profileId);
      const prompt = buildOraclePrompt({ chart, question: trimmed, language, dossierSummary });
      const result = await generateClaudeTextResult(prompt, {
        allowContinuation: true,
        sanitizeOutput: true,
        requireEndTag: "[END_OF_REPORT]",
      });
      try {
        await recordOracleHistory(profileId, { question: trimmed, answer: result.text, model: result.model, channel: "letter" });
        await extractAndStoreFacts(profileId, uid, trimmed, null);
      } catch (e) {
        logger.warn("askInLetter post-processing failed", { profileId, error: (e as Error).message });
      }
      return { answer: result.text, model: result.model };
    } catch (error) {
      try {
        await refundToWallet(uid, TOKEN_COST.oracle);
      } catch {
        /* best-effort */
      }
      if (error instanceof HttpsError) throw error;
      logger.error("askInLetter failed", { profileId, error: (error as Error).message });
      throw new HttpsError("internal", "Failed to answer");
    }
  },
);
