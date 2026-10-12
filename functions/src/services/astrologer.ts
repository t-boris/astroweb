import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Personal Astrologer is account-only (recurring billing, dossier persistence,
 * cross-device). Returns the signed-in uid or throws.
 */
export function requireUid(request: CallableRequest): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required");
  return uid;
}

/**
 * Feature flag gate for letters/billing (Phases 2-4). Dossier/Oracle features
 * are available to all signed-in users; letter generation is gated until the
 * flag is enabled or the uid is allow-listed.
 */
export async function isAstrologerEnabled(uid: string): Promise<boolean> {
  const snap = await getFirestore().collection("featureFlags").doc("personalAstrologer").get();
  if (!snap.exists) return false;
  const data = snap.data() as { enabled?: boolean; allowUids?: string[] } | undefined;
  if (data?.enabled) return true;
  return Array.isArray(data?.allowUids) && data!.allowUids!.includes(uid);
}

export type Cadence = "daily" | "every_2_days" | "every_5_days" | "weekly" | "every_2_weeks";

const CADENCE_DAYS: Record<Cadence, number> = {
  daily: 1,
  every_2_days: 2,
  every_5_days: 5,
  weekly: 7,
  every_2_weeks: 14,
};

export function cadenceDays(cadence: string): number {
  return CADENCE_DAYS[cadence as Cadence] ?? 2;
}

/** Reports per 30-day month, for pricing (3 × this × $0.50). */
export function reportsPerMonth(cadence: string): number {
  return Math.round(30 / cadenceDays(cadence));
}

export function advance(fromISO: string, cadence: string): string {
  const d = new Date(fromISO);
  d.setUTCDate(d.getUTCDate() + cadenceDays(cadence));
  return d.toISOString();
}
