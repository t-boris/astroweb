/**
 * Account gate and content loading for a profile (REQ-001..004, REQ-006, REQ-007).
 *
 * - ensureSignedIn: paid actions need an account (DEC-001). It opens the Google
 *   popup synchronously from the click, waits for claimProfiles, and resolves
 *   true so the original action can continue. No page reload.
 * - loadProfileContent: signed in -> claim once, upload local-only content once
 *   (DEC-002/004), then read everything from the server. Anonymous -> the
 *   browser's own content, untouched.
 */
import { GoogleAuthProvider, signInWithPopup, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { claimProfiles } from "@/api/claim";
import { getProfileContent, uploadLocalContent, type ServerProfileContent } from "@/api/profileContent";
import {
  buildUploadPayload,
  clearLocalContent,
  cleanAiArtifacts,
  compatKeyOf,
  oracleKey,
  readLocalContent,
  type LocalCompatEntry,
  type LocalContent,
  type LocalOracleEntry,
} from "@/lib/localContent";

export interface OracleItem extends LocalOracleEntry {
  /** Server id; absent for content that exists only in this browser. */
  id?: string;
}

export interface CompatItem extends LocalCompatEntry {
  id?: string;
}

export interface LoadedContent {
  /** "server" for a signed-in owner, "local" for anonymous users (or when the server is unreachable). */
  source: "server" | "local";
  deepTexts: Record<string, string>;
  oracleHistory: OracleItem[];
  compatibilityReadings: CompatItem[];
}

const claims = new Map<string, Promise<void>>();

/** claimProfiles(deviceId) once per account and page load; retried after a failure. */
export function claimOnce(uid: string, deviceId: string): Promise<void> {
  let p = claims.get(uid);
  if (!p) {
    p = claimProfiles(deviceId).then(
      () => undefined,
      (e) => {
        claims.delete(uid);
        throw e;
      },
    );
    claims.set(uid, p);
  }
  return p;
}

/** Test helper. */
export function resetClaimsForTests(): void {
  claims.clear();
}

/**
 * Make sure the visitor has an account before a paid action. Call it FIRST in
 * the click handler (before any await) so the browser allows the popup.
 */
export async function ensureSignedIn(deviceId: string): Promise<boolean> {
  const existing = auth.currentUser;
  if (existing) {
    await claimOnce(existing.uid, deviceId);
    return true;
  }
  let user: User;
  try {
    user = (await signInWithPopup(auth, new GoogleAuthProvider())).user;
  } catch {
    return false; // popup closed or blocked: nothing is charged
  }
  await claimOnce(user.uid, deviceId);
  window.dispatchEvent(new Event("astroweb:signed-in"));
  window.dispatchEvent(new Event("astroweb:stars-changed"));
  return true;
}

export function fromServer(s: ServerProfileContent): LoadedContent {
  return {
    source: "server",
    deepTexts: Object.fromEntries(Object.entries(s.deepTexts).map(([k, v]) => [k, cleanAiArtifacts(v.text)])),
    oracleHistory: s.oracleHistory.map((e) => ({
      id: e.id,
      question: e.question,
      answer: cleanAiArtifacts(e.answer),
      model: e.model,
      askedAt: e.askedAt,
    })),
    compatibilityReadings: s.compatibilityReadings.map((r) => ({ ...r, answer: cleanAiArtifacts(r.answer) })),
  };
}

export function fromLocal(l: LocalContent): LoadedContent {
  return { source: "local", ...l };
}

/** Server content plus anything still only local (e.g. an upload that failed), without duplicates. */
export function mergeLeftovers(server: LoadedContent, local: LocalContent): LoadedContent {
  const deepTexts = { ...local.deepTexts, ...server.deepTexts };
  const seenOracle = new Set(server.oracleHistory.map(oracleKey));
  const seenCompat = new Set(server.compatibilityReadings.map(compatKeyOf));
  const oracleHistory = [...server.oracleHistory, ...local.oracleHistory.filter((e) => !seenOracle.has(oracleKey(e)))].sort(
    (a, b) => b.askedAt.localeCompare(a.askedAt),
  );
  const compatibilityReadings = [
    ...server.compatibilityReadings,
    ...local.compatibilityReadings.filter((e) => !seenCompat.has(compatKeyOf(e))),
  ].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  return { source: "server", deepTexts, oracleHistory, compatibilityReadings };
}

export async function loadProfileContent(profileId: string, deviceId: string, language: string): Promise<LoadedContent> {
  await auth.authStateReady();
  const user = auth.currentUser;
  const local = readLocalContent(localStorage, profileId);
  if (!user) return fromLocal(local);

  try {
    await claimOnce(user.uid, deviceId);
  } catch {
    /* claim failed: the upload below is refused for unclaimed profiles anyway */
  }

  let leftovers = local;
  const payload = buildUploadPayload(local, language);
  if (payload) {
    try {
      await uploadLocalContent(profileId, payload);
      clearLocalContent(localStorage, profileId);
      leftovers = { deepTexts: {}, oracleHistory: [], compatibilityReadings: [] };
    } catch {
      /* not this account's profile, or offline: keep the local copy and retry next time */
    }
  }

  try {
    return mergeLeftovers(fromServer(await getProfileContent(profileId, deviceId)), leftovers);
  } catch {
    return fromLocal(local);
  }
}
