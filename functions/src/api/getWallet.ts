import { onCall } from "firebase-functions/v2/https";
import { ownerCtx } from "../services/owner";
import { getWalletBalance, isFirstReadingAvailable, walletKeyFromCtx } from "../services/wallet";

/**
 * Return the caller's star balance from their per-user wallet (account uid when
 * signed in, else the anonymous device). Seeds/migrates legacy per-profile
 * tokens on first touch. Also reports whether the one-time first-reading
 * discount is still available, so the store can show the right price.
 */
export const getWallet = onCall(async (request) => {
  const ctx = ownerCtx(request);
  const key = walletKeyFromCtx(ctx);
  const tokens = await getWalletBalance(key);
  const firstReadingAvailable = await isFirstReadingAvailable(key);
  return { tokens, firstReadingAvailable };
});
