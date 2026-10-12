import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import * as profileService from "../services/profile";
import { ownsProfile } from "../services/owner";
import { requireUid } from "../services/astrologer";
import {
  getDossier,
  listFacts,
  patchDossier,
  setInterestTags,
  setConsentSensitive,
  appendFact,
  confirmFact,
  deleteFact,
  forgetDossier,
  exportDossier,
} from "../services/dossier";
import type { Dossier } from "../types";

/** Account-only: resolve + authorize the profile, return {uid, profile}. */
async function authorize(request: CallableRequest): Promise<{ uid: string; profileId: string }> {
  const uid = requireUid(request);
  const profileId = request.data?.profileId;
  if (typeof profileId !== "string" || !profileId) {
    throw new HttpsError("invalid-argument", "profileId is required");
  }
  const profile = await profileService.getProfileById(profileId);
  if (!profile) throw new HttpsError("not-found", "Profile not found");
  if (!ownsProfile(profile, { uid, deviceId: null })) {
    throw new HttpsError("permission-denied", "Access denied");
  }
  return { uid, profileId };
}

export const getDossierData = onCall(async (request) => {
  const { uid, profileId } = await authorize(request);
  const dossier = await getDossier(profileId, uid);
  const facts = await listFacts(profileId);
  return { dossier, facts };
});

const PATCHABLE = new Set([
  "addressForm",
  "language",
  "relationshipStatus",
  "hasKids",
  "occupation",
  "goals",
  "openLoops",
  "styleNudge",
  "locationCurrent",
]);

export const updateDossier = onCall(async (request) => {
  const { uid, profileId } = await authorize(request);
  const raw = (request.data?.patch ?? {}) as Record<string, unknown>;
  const patch: Partial<Dossier> = {};
  for (const k of Object.keys(raw)) {
    if (PATCHABLE.has(k)) (patch as Record<string, unknown>)[k] = raw[k];
  }
  const dossier = await patchDossier(profileId, uid, patch);
  return { ok: true, dossier };
});

export const setDossierInterests = onCall(async (request) => {
  const { uid, profileId } = await authorize(request);
  const tags = request.data?.tags;
  if (!Array.isArray(tags)) throw new HttpsError("invalid-argument", "tags must be an array");
  const dossier = await setInterestTags(profileId, uid, tags.map((t) => String(t)));
  return { ok: true, dossier };
});

export const setDossierConsent = onCall(async (request) => {
  const { uid, profileId } = await authorize(request);
  await setConsentSensitive(profileId, uid, Boolean(request.data?.value));
  return { ok: true };
});

/** Explicit tap-fact (from onboarding buttons or letter questions). */
export const addDossierFact = onCall(async (request) => {
  const { uid, profileId } = await authorize(request);
  const key = request.data?.key;
  const value = request.data?.value;
  if (typeof key !== "string" || !key || typeof value !== "string" || !value) {
    throw new HttpsError("invalid-argument", "key and value are required");
  }
  const fact = await appendFact(profileId, uid, {
    key: key.slice(0, 40),
    value: value.slice(0, 200),
    source: "tap",
    sensitive: Boolean(request.data?.sensitive),
    confirmed: true, // an explicit tap IS the confirmation
  });
  return { ok: true, fact };
});

export const confirmDossierFact = onCall(async (request) => {
  const { uid, profileId } = await authorize(request);
  const factId = request.data?.factId;
  if (typeof factId !== "string" || !factId) throw new HttpsError("invalid-argument", "factId is required");
  await confirmFact(profileId, uid, factId);
  return { ok: true };
});

export const deleteDossierFact = onCall(async (request) => {
  const { profileId } = await authorize(request);
  const factId = request.data?.factId;
  if (typeof factId !== "string" || !factId) throw new HttpsError("invalid-argument", "factId is required");
  await deleteFact(profileId, factId);
  return { ok: true };
});

export const forgetDossierData = onCall(async (request) => {
  const { profileId } = await authorize(request);
  await forgetDossier(profileId);
  return { ok: true };
});

export const exportUserData = onCall(async (request) => {
  const { profileId } = await authorize(request);
  const profile = await profileService.getProfileById(profileId);
  const data = await exportDossier(profileId);
  return { ok: true, data: { profile, ...(data as object) } };
});
