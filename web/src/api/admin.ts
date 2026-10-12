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

export type StatsPeriod = "7d" | "30d" | "90d" | "all";
export type StatsGrouping = "day" | "week" | "month";

export interface CurrencyStats {
  currency: string;
  revenueCents: number;
  purchases: number;
  payingUsers: number;
  arppuCents: number;
  series: Array<{ bucket: string; revenueCents: number; purchases: number }>;
}

export interface BusinessStats {
  period: StatsPeriod;
  grouping: StatsGrouping;
  generatedAt: string;
  since: string | null;
  currencies: CurrencyStats[];
  totals: { purchases: number; payingUsers: number };
  testPurchasesExcluded: number;
  subscriptions: { active: number; past_due: number; canceled: number; paused: number };
  newProfiles: number;
  starsByFeature: Array<{ feature: string; stars: number }>;
  starLedgerSince: string | null;
}

export async function adminStats(period: StatsPeriod, grouping: StatsGrouping): Promise<BusinessStats> {
  const fn = httpsCallable<{ period: StatsPeriod; grouping: StatsGrouping }, BusinessStats>(functions, "adminStats");
  return (await fn({ period, grouping })).data;
}
