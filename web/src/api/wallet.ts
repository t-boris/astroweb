import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

export interface WalletInfo {
  tokens: number;
  /** Whether the one-time first-reading discount is still available. */
  firstReadingAvailable: boolean;
}

/** Full wallet info: shared star balance + first-purchase eligibility. */
export async function getWalletInfo(ownerDeviceId: string): Promise<WalletInfo> {
  const fn = httpsCallable<{ ownerDeviceId: string }, WalletInfo>(functions, "getWallet");
  const result = await fn({ ownerDeviceId });
  return {
    tokens: result.data.tokens ?? 0,
    firstReadingAvailable: result.data.firstReadingAvailable ?? false,
  };
}

/** The caller's shared star balance (per-user wallet). */
export async function getWallet(ownerDeviceId: string): Promise<number> {
  return (await getWalletInfo(ownerDeviceId)).tokens;
}
