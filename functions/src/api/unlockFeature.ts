import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";
import * as profileService from "../services/profile";
import { TOKEN_COST } from "../services/tokens";
import { ensureWalletInTx, spendInTx, walletKeyFromCtx } from "../services/wallet";
import { ownerCtx, ownsProfile } from "../services/owner";

const FEATURES = {
  interpretations: { flag: "hasPremiumPdf", cost: TOKEN_COST.pdf }, // 4 — full readings + Dig Deeper + PDF
  compatibility: { flag: "hasPremiumCompatibility", cost: TOKEN_COST.compatibility }, // 2
} as const;

/**
 * Spend stars to permanently unlock a feature on a profile (one-time).
 * Atomic: balance check + deduction + flag set happen in one transaction,
 * and an already-unlocked feature is never charged again.
 */
export const unlockFeature = onCall(async (request) => {
  const profileId = request.data?.profileId;
  const feature = request.data?.feature as keyof typeof FEATURES;

  if (typeof profileId !== "string" || !profileId) {
    throw new HttpsError("invalid-argument", "profileId is required");
  }
  if (!feature || !(feature in FEATURES)) {
    throw new HttpsError("invalid-argument", "Invalid feature");
  }

  const ctx = ownerCtx(request);
  const profile = await profileService.getProfileById(profileId);
  if (!profile) {
    throw new HttpsError("not-found", "Profile not found");
  }
  if (!ownsProfile(profile, ctx)) {
    throw new HttpsError("permission-denied", "Access denied");
  }

  const { flag, cost } = FEATURES[feature];
  const walletKey = walletKeyFromCtx(ctx);
  const db = getFirestore();
  const ref = db.collection("profiles").doc(profileId);

  // Atomic: read profile (all reads first), then spend from the wallet and set
  // the unlock flag together. An already-unlocked feature is never recharged.
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Profile not found");
    const data = snap.data()!;
    if (data[flag] === true) {
      const balance = await ensureWalletInTx(tx, walletKey);
      return { tokens: balance, alreadyUnlocked: true };
    }
    const remaining = await spendInTx(tx, walletKey, cost, feature);
    tx.update(ref, { [flag]: true });
    return { tokens: remaining, alreadyUnlocked: false };
  });

  logger.info("unlockFeature", { profileId, feature, charged: !result.alreadyUnlocked });
  return { ok: true, ...result };
});
