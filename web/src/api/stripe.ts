import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

export interface CreateCheckoutSessionPayload {
  profileId: string;
  ownerDeviceId: string;
  /** Outcome-framed pack id; price + credited stars resolved server-side. */
  packId?: string;
  /** Legacy fallback: raw number of stars to buy ($0.99 each). */
  quantity?: number;
}

export interface CreateCheckoutSessionResult {
  url: string;
}

export async function createCheckoutSession(payload: CreateCheckoutSessionPayload): Promise<CreateCheckoutSessionResult> {
  const fn = httpsCallable<CreateCheckoutSessionPayload, CreateCheckoutSessionResult>(functions, "createCheckoutSession");
  const result = await fn(payload);
  return result.data;
}
