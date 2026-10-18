import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import type { Profile } from "../types";
import { grantToWallet, walletKeyFromProfile } from "../services/wallet";
import { GROUPINGS, PERIODS, type Grouping, type Period } from "../services/businessStats";
import { loadBusinessStats } from "../services/businessStatsLoader";
import { assertAdmin } from "../services/adminAuth";


export const adminListProfiles = onCall(async (request) => {
  assertAdmin(request);
  const snap = await getFirestore()
    .collection("profiles")
    .orderBy("createdAt", "desc")
    .limit(500)
    .get();
  const profiles = snap.docs.map((d) => {
    const p = d.data();
    return {
      id: d.id,
      name: p.name ?? "",
      ownerDeviceId: p.ownerDeviceId ?? "",
      birthDate: p.birthDate ?? "",
      birthPlace: p.birthPlace ?? "",
      tokens: p.tokens ?? 0,
      createdAt: p.createdAt ?? null,
    };
  });
  return { profiles };
});

export const adminListPurchases = onCall(async (request) => {
  assertAdmin(request);
  const snap = await getFirestore().collection("purchases").limit(1000).get();
  const purchases = snap.docs.map((d) => {
    const p = d.data();
    return {
      id: d.id,
      profileId: p.profileId ?? "",
      tier: p.tier ?? null,
      tokens: p.tokens ?? 0,
      amountTotal: p.amountTotal ?? 0,
      currency: p.currency ?? "usd",
      customerEmail: p.customerEmail ?? null,
      createdAt: p.createdAt ? p.createdAt.toDate?.().toISOString?.() ?? null : null,
    };
  });
  purchases.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  const revenueCents = purchases.reduce((sum, p) => sum + (p.amountTotal || 0), 0);
  return { purchases, revenueCents, count: purchases.length };
});

export const adminGrantTokens = onCall(async (request) => {
  assertAdmin(request);
  const profileId = request.data?.profileId;
  const amount = Math.trunc(Number(request.data?.amount));
  if (typeof profileId !== "string" || !profileId) {
    throw new HttpsError("invalid-argument", "profileId is required");
  }
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 1000) {
    throw new HttpsError("invalid-argument", "amount must be a non-zero integer (max 1000)");
  }
  // Stars live in the owner's wallet now — grant there, resolved from the
  // target profile's owner.
  const snap = await getFirestore().collection("profiles").doc(profileId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Profile not found");
  const key = walletKeyFromProfile(snap.data() as Profile);
  if (!key) throw new HttpsError("failed-precondition", "Profile has no owner");
  const newBalance = await grantToWallet(key, amount);
  return { ok: true, tokens: newBalance };
});

/**
 * List users (star wallets). Stars are per-user, so we group profiles by their
 * owner (account uid or anonymous device), attach the wallet balance and, for
 * accounts, the email.
 */
export const adminListUsers = onCall(async (request) => {
  assertAdmin(request);
  const db = getFirestore();
  const snap = await db.collection("profiles").orderBy("createdAt", "desc").limit(500).get();

  interface Group {
    key: string;
    uid: string | null;
    profiles: { id: string; name: string }[];
    profileTokenSum: number;
  }
  const groups = new Map<string, Group>();
  snap.forEach((d) => {
    const p = d.data();
    const uid = (p.ownerUid as string | undefined) ?? null;
    const key = uid ? uid : p.ownerDeviceId ? `device:${p.ownerDeviceId}` : null;
    if (!key) return;
    let g = groups.get(key);
    if (!g) {
      g = { key, uid, profiles: [], profileTokenSum: 0 };
      groups.set(key, g);
    }
    g.profiles.push({ id: d.id, name: (p.name as string) ?? "" });
    g.profileTokenSum += (p.tokens as number) ?? 0;
  });

  const users = await Promise.all(
    [...groups.values()].map(async (g) => {
      const wsnap = await db.collection("wallets").doc(g.key).get();
      // Wallet balance, or the not-yet-migrated per-profile sum as a fallback.
      const tokens = wsnap.exists ? ((wsnap.data()?.tokens as number) ?? 0) : g.profileTokenSum;
      let email: string | null = null;
      if (g.uid) {
        try {
          email = (await getAuth().getUser(g.uid)).email ?? null;
        } catch {
          email = null;
        }
      }
      return { key: g.key, isAccount: Boolean(g.uid), email, tokens, profiles: g.profiles };
    }),
  );
  users.sort((a, b) => b.tokens - a.tokens);
  return { users };
});

/** Grant (or deduct) stars directly on a user's wallet. */
export const adminGrantToWallet = onCall(async (request) => {
  assertAdmin(request);
  const walletKey = request.data?.walletKey;
  const amount = Math.trunc(Number(request.data?.amount));
  if (typeof walletKey !== "string" || !walletKey) {
    throw new HttpsError("invalid-argument", "walletKey is required");
  }
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 1000) {
    throw new HttpsError("invalid-argument", "amount must be a non-zero integer (max 1000)");
  }
  const tokens = await grantToWallet(walletKey, amount);
  return { ok: true, tokens };
});

/**
 * KPIs for the admin Business tab (REQ-006): per-currency revenue, purchases,
 * paying users, ARPPU, subscription counts, new profiles and net stars per
 * feature for the chosen UTC period. Admin only.
 */
export const adminStats = onCall(async (request) => {
  assertAdmin(request);
  const period = request.data?.period ?? "30d";
  const grouping = request.data?.grouping ?? "day";
  if (!PERIODS.includes(period)) throw new HttpsError("invalid-argument", "period must be 7d, 30d, 90d or all");
  if (!GROUPINGS.includes(grouping)) throw new HttpsError("invalid-argument", "grouping must be day, week or month");
  return loadBusinessStats(period as Period, grouping as Grouping);
});
