import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

export type UnlockableFeature = "interpretations" | "compatibility";

export async function unlockFeature(payload: {
  profileId: string;
  ownerDeviceId: string;
  feature: UnlockableFeature;
}): Promise<{ ok: boolean; tokens: number; alreadyUnlocked: boolean }> {
  const fn = httpsCallable<
    typeof payload,
    { ok: boolean; tokens: number; alreadyUnlocked: boolean }
  >(functions, "unlockFeature");
  const r = await fn(payload);
  return r.data;
}
