import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import type { CheckoutAnalytics } from "@/lib/analytics";

export interface CreateCheckoutSessionPayload {
  profileId: string;
  ownerDeviceId: string;
  /** Outcome-framed pack id; price + credited stars resolved server-side. */
  packId?: string;
  /** Legacy fallback: raw number of stars to buy ($0.99 each). */
  quantity?: number;
  /** Analytics consent + GA client_id at checkout time (REQ-002). */
  analytics?: CheckoutAnalytics;
}

export interface CreateCheckoutSessionResult {
  url: string;
}

export async function createCheckoutSession(payload: CreateCheckoutSessionPayload): Promise<CreateCheckoutSessionResult> {
  const fn = httpsCallable<CreateCheckoutSessionPayload, CreateCheckoutSessionResult>(functions, "createCheckoutSession");
  const result = await fn(payload);
  return result.data;
}
