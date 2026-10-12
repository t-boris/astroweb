import { HttpsError } from "firebase-functions/v2/https";
import {
  getFirestore,
  FieldValue,
  Transaction,
} from "firebase-admin/firestore";
import type { Profile } from "../types";
import type { OwnerCtx } from "./owner";

/**
 * Per-user star wallet. Stars are owned by a *user*, not a profile: a single
 * balance shared across all of that user's profiles. The wallet key is the
 * account uid when signed in (follows the user across devices), or
 * `device:<deviceId>` while anonymous.
 *
 * Existing per-profile `tokens` (legacy model) are migrated lazily and once:
 * the first time a wallet is touched it is seeded by summing the owner's
 * profile balances, which are then zeroed. Idempotent — guarded by the wallet
 * doc's existence.
 */

const DEVICE_PREFIX = "device:";

/** Build the wallet key for a request's ownership context. */
export function walletKeyFromCtx(ctx: OwnerCtx): string {
  if (ctx.uid) return ctx.uid;
  if (ctx.deviceId) return `${DEVICE_PREFIX}${ctx.deviceId}`;
  throw new HttpsError("unauthenticated", "No owner identity");
}

/** Build the wallet key for the owner of a profile (uid wins over device). */
export function walletKeyFromProfile(
  profile: Pick<Profile, "ownerUid" | "ownerDeviceId">,
): string | null {
  if (profile.ownerUid) return profile.ownerUid;
  if (profile.ownerDeviceId) return `${DEVICE_PREFIX}${profile.ownerDeviceId}`;
  return null;
}

/** Reconstruct the ownership context from a wallet key (for seeding). */
function ctxFromKey(key: string): OwnerCtx {
  if (key.startsWith(DEVICE_PREFIX)) {
    return { uid: null, deviceId: key.slice(DEVICE_PREFIX.length) };
  }
  return { uid: key, deviceId: null };
}

function walletRef(key: string) {
  return getFirestore().collection("wallets").doc(key);
}

interface WalletSeed {
  /** Sum of legacy per-profile tokens to migrate into the wallet. */
  seed: number;
  /** Profile docs whose tokens must be zeroed once migrated. */
  toZero: FirebaseFirestore.DocumentReference[];
}

/**
 * Read-only: compute the seed for a not-yet-existing wallet from the owner's
 * legacy per-profile token balances. Issues only reads, so it is safe to call
 * for multiple wallets before any writes in a transaction.
 */
async function readWalletSeedInTx(tx: Transaction, key: string): Promise<WalletSeed> {
  const ctx = ctxFromKey(key);
  const db = getFirestore();
  const query = ctx.uid
    ? db.collection("profiles").where("ownerUid", "==", ctx.uid)
    : db.collection("profiles").where("ownerDeviceId", "==", ctx.deviceId);
  const profilesSnap = await tx.get(query);

  let seed = 0;
  const toZero: FirebaseFirestore.DocumentReference[] = [];
  profilesSnap.forEach((doc) => {
    const data = doc.data();
    // For a device wallet, ignore profiles already claimed by an account —
    // those belong to the account's wallet, not the device's.
    if (!ctx.uid && data.ownerUid) return;
    const t = (data.tokens as number) ?? 0;
    if (t > 0) {
      seed += t;
      toZero.push(doc.ref);
    }
  });
  return { seed, toZero };
}

/**
 * Read the wallet balance inside a transaction, lazily seeding + migrating
 * legacy per-profile tokens on first touch. Performs reads and (only when
 * seeding) writes — callers must not issue reads after calling this.
 */
export async function ensureWalletInTx(tx: Transaction, key: string): Promise<number> {
  const ref = walletRef(key);
  const snap = await tx.get(ref);
  if (snap.exists) {
    return (snap.data()?.tokens as number) ?? 0;
  }

  const { seed, toZero } = await readWalletSeedInTx(tx, key);

  // Writes (all reads above are done).
  for (const docRef of toZero) {
    tx.update(docRef, { tokens: 0 });
  }
  tx.set(ref, { tokens: seed, updatedAt: FieldValue.serverTimestamp() });
  return seed;
}

/**
 * Spend `cost` stars from the wallet. Throws failed-precondition
 * ("INSUFFICIENT_TOKENS") when the balance is too low. Returns the remaining
 * balance.
 */
export async function spendFromWallet(key: string, cost: number): Promise<number> {
  const db = getFirestore();
  return db.runTransaction(async (tx) => {
    const balance = await ensureWalletInTx(tx, key);
    if (balance < cost) {
      throw new HttpsError("failed-precondition", "INSUFFICIENT_TOKENS");
    }
    tx.set(
      walletRef(key),
      { tokens: balance - cost, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    return balance - cost;
  });
}

/**
 * Spend `cost` stars within an existing transaction — for callers that must
 * atomically combine the spend with another write (e.g. setting a profile's
 * unlock flag). All reads in the transaction must precede this call.
 */
export async function spendInTx(tx: Transaction, key: string, cost: number): Promise<number> {
  const balance = await ensureWalletInTx(tx, key);
  if (balance < cost) {
    throw new HttpsError("failed-precondition", "INSUFFICIENT_TOKENS");
  }
  tx.set(
    walletRef(key),
    { tokens: balance - cost, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  return balance - cost;
}

/** Add stars back after a failed action (best-effort path uses this too). */
export async function refundToWallet(key: string, amount: number): Promise<number> {
  return grantToWallet(key, amount);
}

/** Credit stars (purchase fulfilment or admin). Returns the new balance. */
export async function grantToWallet(key: string, amount: number): Promise<number> {
  const db = getFirestore();
  return db.runTransaction(async (tx) => {
    const balance = await ensureWalletInTx(tx, key);
    const next = Math.max(0, balance + amount);
    tx.set(
      walletRef(key),
      { tokens: next, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    return next;
  });
}

/** Current wallet balance (seeds/migrates on first touch). */
export async function getWalletBalance(key: string): Promise<number> {
  const db = getFirestore();
  return db.runTransaction(async (tx) => ensureWalletInTx(tx, key));
}

/**
 * Whether the user is still eligible for the one-time first-reading discount.
 * Pure read — never creates the wallet doc (a missing wallet means no purchase
 * yet, so the discount is available).
 */
export async function isFirstReadingAvailable(key: string): Promise<boolean> {
  const snap = await walletRef(key).get();
  if (!snap.exists) return true;
  return snap.data()?.firstReadingUsed !== true;
}

/**
 * Mark the one-time first-reading discount as consumed. Call only after the
 * wallet has been seeded/credited (e.g. right after grantToWallet) so the merge
 * write never short-circuits the lazy legacy-token migration.
 */
export async function markFirstReadingUsed(key: string): Promise<void> {
  await walletRef(key).set(
    { firstReadingUsed: true, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

/**
 * Merge a source wallet into a destination wallet (used on sign-in to move an
 * anonymous device balance into the account). Idempotent and safe to call when
 * either wallet does not yet exist. Returns the destination's new balance.
 */
export async function mergeWallets(fromKey: string, toKey: string): Promise<number> {
  if (fromKey === toKey) return getWalletBalance(toKey);
  const db = getFirestore();
  return db.runTransaction(async (tx) => {
    const fromRef = walletRef(fromKey);
    const toRef = walletRef(toKey);

    // All reads first (Firestore forbids reads after writes in a transaction).
    const fromSnap = await tx.get(fromRef);
    const toSnap = await tx.get(toRef);
    const fromSeed = fromSnap.exists ? null : await readWalletSeedInTx(tx, fromKey);
    const toSeed = toSnap.exists ? null : await readWalletSeedInTx(tx, toKey);

    const fromBalance = fromSnap.exists ? ((fromSnap.data()?.tokens as number) ?? 0) : fromSeed!.seed;
    const toBalance = toSnap.exists ? ((toSnap.data()?.tokens as number) ?? 0) : toSeed!.seed;

    // Writes.
    for (const docRef of [...(fromSeed?.toZero ?? []), ...(toSeed?.toZero ?? [])]) {
      tx.update(docRef, { tokens: 0 });
    }
    const next = toBalance + fromBalance;
    tx.set(fromRef, { tokens: 0, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(toRef, { tokens: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return next;
  });
}
