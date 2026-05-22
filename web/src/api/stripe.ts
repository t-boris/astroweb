import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

export interface CreateCheckoutSessionPayload {
  profileId: string;
  ownerDeviceId: string;
  tier: "pdf" | "oracle";
}

export interface CreateCheckoutSessionResult {
  url: string;
}

export async function createCheckoutSession(payload: CreateCheckoutSessionPayload): Promise<CreateCheckoutSessionResult> {
  const fn = httpsCallable<CreateCheckoutSessionPayload, CreateCheckoutSessionResult>(functions, "createCheckoutSession");
  const result = await fn(payload);
  return result.data;
}
