import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

export interface AdminProfile {
  id: string;
  name: string;
  ownerDeviceId: string;
  birthDate: string;
  birthPlace: string;
  tokens: number;
  createdAt: string | null;
}

export interface AdminPurchase {
  id: string;
  profileId: string;
  tier: string | null;
  tokens: number;
  amountTotal: number;
  currency: string;
  customerEmail: string | null;
  createdAt: string | null;
}

export async function adminListProfiles(): Promise<AdminProfile[]> {
  const fn = httpsCallable<void, { profiles: AdminProfile[] }>(functions, "adminListProfiles");
  const r = await fn();
  return r.data.profiles;
}

export async function adminListPurchases(): Promise<{
  purchases: AdminPurchase[];
  revenueCents: number;
  count: number;
}> {
  const fn = httpsCallable<void, { purchases: AdminPurchase[]; revenueCents: number; count: number }>(
    functions,
    "adminListPurchases",
  );
  const r = await fn();
  return r.data;
}

export async function adminGrantTokens(profileId: string, amount: number): Promise<number> {
  const fn = httpsCallable<{ profileId: string; amount: number }, { ok: boolean; tokens: number }>(
    functions,
    "adminGrantTokens",
  );
  const r = await fn({ profileId, amount });
  return r.data.tokens;
}

export interface AdminUser {
  key: string;
  isAccount: boolean;
  email: string | null;
  tokens: number;
  profiles: { id: string; name: string }[];
}

export async function adminListUsers(): Promise<AdminUser[]> {
  const fn = httpsCallable<void, { users: AdminUser[] }>(functions, "adminListUsers");
  const r = await fn();
  return r.data.users;
}

export async function adminGrantToWallet(walletKey: string, amount: number): Promise<number> {
  const fn = httpsCallable<{ walletKey: string; amount: number }, { ok: boolean; tokens: number }>(
    functions,
    "adminGrantToWallet",
  );
  const r = await fn({ walletKey, amount });
  return r.data.tokens;
}
