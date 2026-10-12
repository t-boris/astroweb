import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

/** Link this device's anonymous profiles to the signed-in account. */
export async function claimProfiles(deviceId: string): Promise<number> {
  const fn = httpsCallable<{ deviceId: string }, { claimed: number }>(functions, "claimProfiles");
  const r = await fn({ deviceId });
  return r.data.claimed;
}
