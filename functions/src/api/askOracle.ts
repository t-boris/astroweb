import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { normalizeLanguage } from "../services/prompts";
import { AI_SECRETS } from "../services/ai/keys";
import { getProfileById } from "../services/profile";
import { TOKEN_COST } from "../services/tokens";
import { spendFromWallet, refundToWallet, walletKeyFromCtx } from "../services/wallet";
import { ownsProfile, requireAccount } from "../services/owner";
import { generateSituationForecast, parseSituationQuestion } from "../services/forecastGeneration";

export const askOracle = onCall({
  timeoutSeconds: 180,
  secrets: AI_SECRETS,
}, async (request) => {
  // Paid action: account only (DEC-001, REQ-004). Checked before anything else.
  const uid = requireAccount(request);
  const profileId = request.data?.profileId;
  const language = normalizeLanguage(request.data?.language);
  const relocationLat = request.data?.relocationLat;
  const relocationLng = request.data?.relocationLng;

  if (!profileId || typeof profileId !== "string") {
    throw new HttpsError("invalid-argument", "profileId is required");
  }
  const trimmedQuestion = parseSituationQuestion(request.data?.question);

  // Ownership check
  const ctx = { uid, deviceId: null };
  const profile = await getProfileById(profileId);
  if (!profile) {
    throw new HttpsError("not-found", "Profile not found");
  }
  if (!ownsProfile(profile, ctx)) {
    throw new HttpsError("permission-denied", "Not authorized");
  }

  // Spend stars up front from the user's wallet (throws failed-precondition "INSUFFICIENT_TOKENS").
  const walletKey = walletKeyFromCtx(ctx);
  await spendFromWallet(walletKey, TOKEN_COST.oracle, "oracle");

  try {
    logger.info("askOracle request", {
      profileId,
      questionLength: trimmedQuestion.length,
      language,
    });

    const out = await generateSituationForecast({
      profileId,
      uid,
      question: trimmedQuestion,
      language,
      relocationLat,
      relocationLng,
    });

    logger.info("askOracle success", {
      profileId,
      answerLength: out.answer.length,
      periodStart: out.periodStart,
      periodEnd: out.periodEnd,
    });

    return out;
  } catch (error) {
    try {
      await refundToWallet(walletKey, TOKEN_COST.oracle, "oracle");
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
