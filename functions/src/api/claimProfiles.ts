import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { claimProfilesForUid } from "../services/profile";
import { mergeWallets } from "../services/wallet";

/**
 * Link a device's anonymous profiles to the signed-in account (first sign-in
 * on that device). Idempotent — already-claimed profiles are skipped. Also
 * merges the device's star wallet into the account wallet so anonymous
 * purchases follow the user into their account.
 */
export const claimProfiles = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }
  const deviceId = request.data?.deviceId;
  if (typeof deviceId !== "string" || !deviceId.trim()) {
    throw new HttpsError("invalid-argument", "deviceId is required");
  }

  // Claim profiles first (so account-wallet seeding picks up their balances),
  // then fold any remaining device-wallet balance into the account wallet.
  const claimed = await claimProfilesForUid(deviceId.trim(), uid);
  const tokens = await mergeWallets(`device:${deviceId.trim()}`, uid);
  logger.info("claimProfiles", { uid, claimed, tokens });
  return { claimed, tokens };
});
