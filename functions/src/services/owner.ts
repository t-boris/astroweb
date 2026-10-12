import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import type { Profile } from "../types";

/**
 * Ownership context for a request. During the account migration we support
 * BOTH a signed-in account (uid, cross-device, money-safe) and the legacy
 * anonymous device id. A profile, once claimed by an account (ownerUid set),
 * can only be accessed by that account.
 */
export interface OwnerCtx {
  uid: string | null;
  deviceId: string | null;
}

export function ownerCtx(request: CallableRequest): OwnerCtx {
  const uid = (request.auth?.uid as string | undefined) ?? null;
  const rawDevice = request.data?.ownerDeviceId;
  const deviceId = typeof rawDevice === "string" && rawDevice.trim() ? rawDevice.trim() : null;
  if (!uid && !deviceId) {
    throw new HttpsError("unauthenticated", "Sign in or provide a device id");
  }
  return { uid, deviceId };
}

/**
 * Paid actions and server-stored content need a signed-in account (DEC-001).
 * A caller authenticated only by a device id gets `unauthenticated` before any
 * charge or write happens.
 */
export function requireAccount(request: CallableRequest): string {
  const uid = (request.auth?.uid as string | undefined) ?? null;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }
  return uid;
}

/** True if this context may access the profile. */
export function ownsProfile(profile: Pick<Profile, "ownerUid" | "ownerDeviceId">, ctx: OwnerCtx): boolean {
  if (ctx.uid && profile.ownerUid && profile.ownerUid === ctx.uid) return true;
  // Device access only while the profile has NOT been claimed by an account.
  if (ctx.deviceId && !profile.ownerUid && profile.ownerDeviceId === ctx.deviceId) return true;
  return false;
}
