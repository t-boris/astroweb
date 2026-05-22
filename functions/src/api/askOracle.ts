import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { resolveOwnedChart } from "../services/chartResolver";
import {
  buildOraclePrompt,
  generateGeminiText,
  getGeminiModelName,
  normalizeLanguage,
} from "../services/gemini";
import { getProfileById } from "../services/profile";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

export const askOracle = onCall(async (request) => {
  const profileId = request.data?.profileId;
  const ownerDeviceId = request.data?.ownerDeviceId;
  const question = request.data?.question;
  const language = normalizeLanguage(request.data?.language);
  const relocationLat = request.data?.relocationLat;
  const relocationLng = request.data?.relocationLng;

  if (!profileId || typeof profileId !== "string") {
    throw new HttpsError("invalid-argument", "profileId is required");
  }

  if (!ownerDeviceId || typeof ownerDeviceId !== "string") {
    throw new HttpsError("invalid-argument", "ownerDeviceId is required");
  }

  if (!question || typeof question !== "string") {
    throw new HttpsError("invalid-argument", "question is required");
  }

  const trimmedQuestion = question.trim();
  if (trimmedQuestion.length === 0) {
    throw new HttpsError("invalid-argument", "question cannot be empty");
  }

  if (trimmedQuestion.length > 1000) {
    throw new HttpsError("invalid-argument", "question is too long");
  }

    // Check oracle credits
    const profile = await getProfileById(profileId);
    if (!profile) {
      throw new HttpsError("not-found", "Profile not found");
    }
    
    if (profile.ownerDeviceId !== ownerDeviceId) {
      throw new HttpsError("permission-denied", "Not authorized");
    }

    if (!profile.oracleCredits || profile.oracleCredits <= 0) {
      throw new HttpsError("permission-denied", "No oracle credits available. Please purchase more.");
    }

    // Deduct one credit
    await getFirestore().collection("profiles").doc(profileId).update({
      oracleCredits: FieldValue.increment(-1)
    });

  try {
    const { chart } = await resolveOwnedChart({
      profileId,
      ownerDeviceId,
      relocationLat,
      relocationLng,
    });
    const basePrompt = buildOraclePrompt({
      chart,
      question: trimmedQuestion,
      language,
    });

    logger.info("askOracle request", {
      profileId,
      questionLength: trimmedQuestion.length,
      language,
    });

    const answer = await generateGeminiText(basePrompt, {
      allowContinuation: true,
      sanitizeOutput: true,
      requireEndTag: "[END_OF_REPORT]",
    });

    logger.info("askOracle success", {
      profileId,
      answerLength: answer.length,
      answerWords: answer.split(/\s+/).filter(Boolean).length,
    });

    return {
      answer,
      model: getGeminiModelName(),
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }

    logger.error("askOracle failed", {
      profileId,
      error: (error as Error).message,
    });
    throw new HttpsError("internal", "Failed to answer oracle question");
  }
});
