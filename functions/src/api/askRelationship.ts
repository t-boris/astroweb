import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { normalizeLanguage } from "../services/prompts";
import { AI_SECRETS } from "../services/ai/keys";
import { TOKEN_COST } from "../services/tokens";
import { spendFromWallet, refundToWallet } from "../services/wallet";
import { ownsProfile, requireAccount } from "../services/owner";
import { getProfileById } from "../services/profile";
import { generateRelationshipForecast, parsePartnerInput } from "../services/forecastGeneration";

export const askRelationship = onCall({
  timeoutSeconds: 180,
  secrets: AI_SECRETS,
}, async (request) => {
  // Paid action: account only (DEC-001, REQ-006).
  const uid = requireAccount(request);
  const profileId = request.data?.profileId;
  const language = normalizeLanguage(request.data?.language);
  const relocationLat = request.data?.relocationLat;
  const relocationLng = request.data?.relocationLng;
  const partner = parsePartnerInput(request.data?.partner);

  if (!profileId || typeof profileId !== "string") {
    throw new HttpsError("invalid-argument", "profileId is required");
  }

  const profile = await getProfileById(profileId);
  if (!profile) {
    throw new HttpsError("not-found", "Profile not found");
  }
  if (!ownsProfile(profile, { uid, deviceId: null })) {
    throw new HttpsError("permission-denied", "Not authorized");
  }

  const walletKey = uid;
  await spendFromWallet(walletKey, TOKEN_COST.compatibility, "relationship");

  try {
    const out = await generateRelationshipForecast({
      profileId,
      uid,
      partner,
      language,
      relocationLat,
      relocationLng,
    });

    logger.info("askRelationship success", {
      profileId,
      partnerName: partner.name,
      answerLength: out.answer.length,
      periodStart: out.periodStart,
      periodEnd: out.periodEnd,
    });

    return out;
  } catch (error) {
    try {
      await refundToWallet(walletKey, TOKEN_COST.compatibility, "relationship");
      logger.info("askRelationship refunded tokens after failure", { profileId });
    } catch (refundError) {
      logger.error("askRelationship failed to refund tokens", {
        profileId,
        error: (refundError as Error).message,
      });
    }

    if (error instanceof HttpsError) {
      throw error;
    }

    logger.error("askRelationship failed", {
      profileId,
      error: (error as Error).message,
    });
    throw new HttpsError("internal", "Failed to generate relationship reading");
  }
});
