import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import type { CheckoutAnalytics } from "@/lib/analytics";

export type Cadence = "daily" | "every_2_days" | "every_5_days" | "weekly" | "every_2_weeks";

export interface Subscription {
  profileId: string;
  status: "active" | "paused" | "past_due" | "canceled";
  cadence: Cadence;
  billingPeriod: "monthly" | "annual";
  channels: { inApp: boolean; email: boolean };
  /** Custom letter recipients; empty = the account email. */
  recipientEmails?: string[];
  currentPeriodEnd: string;
  nextLetterAt: string;
  canceledAt: string | null;
  astrologerName: string;
}

export async function getAstrologerStatus(profileId: string): Promise<Subscription | null> {
  const fn = httpsCallable<{ profileId: string }, { subscription: Subscription | null }>(functions, "getAstrologerStatus");
  return (await fn({ profileId })).data.subscription;
}

export async function subscribeAstrologer(input: {
  profileId: string;
  cadence: Cadence;
  billingPeriod: "monthly" | "annual";
  channels: { email: boolean };
  /** Comma-separated custom recipients; empty = the account email. */
  recipientEmails?: string;
  astrologerName: string;
  /** Analytics consent + GA client_id at checkout time (REQ-002, DEC-007). */
  analytics?: CheckoutAnalytics;
}): Promise<string> {
  const fn = httpsCallable<typeof input, { url: string }>(functions, "subscribeAstrologer");
  return (await fn(input)).data.url;
}

export async function setSubscriptionChannels(input: {
  profileId: string;
  channels: { email: boolean };
  recipientEmails?: string;
}): Promise<void> {
  await httpsCallable(functions, "setSubscriptionChannels")(input);
}

export async function cancelSubscription(profileId: string): Promise<void> {
  await httpsCallable(functions, "cancelSubscription")({ profileId });
}
export async function pauseSubscription(profileId: string): Promise<void> {
  await httpsCallable(functions, "pauseSubscription")({ profileId });
}
export async function resumeSubscription(profileId: string): Promise<void> {
  await httpsCallable(functions, "resumeSubscription")({ profileId });
}

// Pricing anchored on "every 2 days" = $9.99/mo; other cadences scale with
// letter frequency. Annual = 9 months for 12 ("3 months free"). Mirrors
// functions/src/services/pricing.ts.
const REPORTS_PER_MONTH: Record<Cadence, number> = {
  daily: 30,
  every_2_days: 15,
  every_5_days: 6,
  weekly: 4,
  every_2_weeks: 2,
};
const ANCHOR_MONTHLY = 9.99;
const ANCHOR_REPORTS = REPORTS_PER_MONTH.every_2_days;

export function monthlyPriceUsd(cadence: Cadence): number {
  return Math.round((ANCHOR_MONTHLY * REPORTS_PER_MONTH[cadence]) / ANCHOR_REPORTS * 100) / 100;
}
export function annualPriceUsd(cadence: Cadence): number {
  return Math.round(monthlyPriceUsd(cadence) * 9 * 100) / 100;
}
