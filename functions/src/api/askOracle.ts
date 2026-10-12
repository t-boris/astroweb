import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { resolveOwnedChart } from "../services/chartResolver";
import {
  buildOraclePrompt,
  generateClaudeTextResult,
  normalizeLanguage,
} from "../services/anthropic";
import { getProfileById } from "../services/profile";
import { TOKEN_COST } from "../services/tokens";
import { spendFromWallet, refundToWallet, walletKeyFromCtx } from "../services/wallet";
import { ownerCtx, ownsProfile } from "../services/owner";
import { getDossierSummaryText, recordOracleHistory } from "../services/dossier";
import { extractAndStoreFacts } from "../services/factExtraction";

export const askOracle = onCall({
  timeoutSeconds: 180,
  secrets: ["ANTHROPIC_API_KEY"],
}, async (request) => {
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

    // Ownership check
    const ctx = ownerCtx(request);
    const profile = await getProfileById(profileId);
    if (!profile) {
      throw new HttpsError("not-found", "Profile not found");
    }

    if (!ownsProfile(profile, ctx)) {
      throw new HttpsError("permission-denied", "Not authorized");
    }

    // Spend stars up front from the user's wallet (throws failed-precondition
    // "INSUFFICIENT_TOKENS").
    const walletKey = walletKeyFromCtx(ctx);
    await spendFromWallet(walletKey, TOKEN_COST.oracle);

  try {
    const { chart } = await resolveOwnedChart({
      profileId,
      ownerDeviceId,
      uid: ctx.uid,
      relocationLat,
      relocationLng,
    });

    // Person-aware answers: inject the dossier summary when this chart has one
    // (only meaningful for signed-in accounts that own the dossier).
    let dossierSummary = "";
    if (ctx.uid) {
      try {
        dossierSummary = await getDossierSummaryText(profileId);
      } catch {
        /* dossier optional */
      }
    }

    const basePrompt = buildOraclePrompt({
      chart,
      question: trimmedQuestion,
      language,
      dossierSummary,
    });

    logger.info("askOracle request", {
      profileId,
      questionLength: trimmedQuestion.length,
      language,
    });

    const result = await generateClaudeTextResult(basePrompt, {
      allowContinuation: true,
      sanitizeOutput: true,
      requireEndTag: "[END_OF_REPORT]",
    });

    logger.info("askOracle success", {
      profileId,
      answerLength: result.text.length,
      answerWords: result.text.split(/\s+/).filter(Boolean).length,
    });

    // Server-side history + background fact extraction (signed-in accounts only).
    if (ctx.uid) {
      try {
        await recordOracleHistory(profileId, {
          question: trimmedQuestion,
          answer: result.text,
          model: result.model,
          channel: "web",
        });
        await extractAndStoreFacts(profileId, ctx.uid, trimmedQuestion, null);
      } catch (e) {
        logger.warn("askOracle post-processing failed", { profileId, error: (e as Error).message });
      }
    }

    return {
      answer: result.text,
      model: result.model,
    };
  } catch (error) {
    // Generation failed after tokens were spent — refund so the user isn't
    // charged for an answer they didn't receive. Best-effort.
    try {
      await refundToWallet(walletKey, TOKEN_COST.oracle);
      logger.info("askOracle refunded tokens after failure", { profileId });
    } catch (refundError) {
      logger.error("askOracle failed to refund tokens", {
        profileId,
        error: (refundError as Error).message,
      });
    }

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
