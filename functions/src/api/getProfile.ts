import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import * as profileService from "../services/profile";
import { ownerCtx, ownsProfile } from "../services/owner";
import { getWalletBalance, walletKeyFromCtx } from "../services/wallet";

export const getProfile = onCall(async (request) => {
  const { data } = request;

  if (typeof data?.profileId !== "string" || data.profileId.trim().length === 0) {
    throw new HttpsError("invalid-argument", "profileId is required");
  }

  const ctx = ownerCtx(request);

  try {
    const profile = await profileService.getProfileById(data.profileId);

    if (!profile) {
      throw new HttpsError("not-found", "Profile not found");
    }

    if (!ownsProfile(profile, ctx)) {
      throw new HttpsError("permission-denied", "Access denied");
    }

    // Stars are a per-user wallet shared across all profiles. Surface the
    // wallet balance as `tokens` so the detail UI shows the shared balance.
    const tokens = await getWalletBalance(walletKeyFromCtx(ctx));
    return { ...profile, tokens };
  } catch (error) {
    // Re-throw HttpsError instances as-is
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error("getProfile failed", { profileId: data.profileId, error: (error as Error).message });
    throw new HttpsError("internal", "An unexpected error occurred");
  }
});
