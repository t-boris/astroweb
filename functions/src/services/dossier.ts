import { getFirestore } from "firebase-admin/firestore";
import type { Dossier, DossierFact, StyleProfile } from "../types";

/**
 * Per-chart dossier: a resolved summary doc (`dossiers/{profileId}`) plus a
 * provenance-tracked facts log (`dossiers/{profileId}/facts`). Shared by the
 * web Oracle and (later) the letter engine. Server-only (Admin SDK).
 */

const SUMMARY_KEYS = new Set([
  "addressForm",
  "language",
  "relationshipStatus",
  "hasKids",
  "occupation",
]);
const ARRAY_KEYS = new Set(["interests", "goals", "openLoops"]);

export function defaultStyleProfile(): StyleProfile {
  return { humor: 0.4, seriousness: 0.5, formality: 0.2, warmth: 0.6, brevity: 0.6, mysticism: 0.4, emoji: 0.2 };
}

function dossierRef(profileId: string) {
  return getFirestore().collection("dossiers").doc(profileId);
}
function factsRef(profileId: string) {
  return dossierRef(profileId).collection("facts");
}

/** Read the dossier, creating a default if it does not exist. */
export async function getDossier(profileId: string, ownerUid: string, language: "ru" | "en" = "ru"): Promise<Dossier> {
  const ref = dossierRef(profileId);
  const snap = await ref.get();
  if (snap.exists) return snap.data() as Dossier;

  const now = new Date().toISOString();
  const fresh: Dossier = {
    profileId,
    ownerUid,
    language,
    addressForm: null,
    locationCurrent: null,
    relationshipStatus: null,
    hasKids: null,
    occupation: null,
    interests: [],
    goals: [],
    openLoops: [],
    styleProfile: defaultStyleProfile(),
    styleNudge: null,
    consentSensitive: false,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(fresh);
  return fresh;
}

/** Patch summary fields directly (used by onboarding / explicit edits). */
export async function patchDossier(profileId: string, ownerUid: string, patch: Partial<Dossier>): Promise<Dossier> {
  await getDossier(profileId, ownerUid);
  await dossierRef(profileId).set({ ...patch, updatedAt: new Date().toISOString() }, { merge: true });
  return (await dossierRef(profileId).get()).data() as Dossier;
}

export async function setInterestTags(profileId: string, ownerUid: string, tags: string[]): Promise<Dossier> {
  const clean = Array.from(new Set(tags.map((t) => t.trim()).filter((t) => t && t.length <= 40))).slice(0, 20);
  return patchDossier(profileId, ownerUid, { interests: clean });
}

export async function setConsentSensitive(profileId: string, ownerUid: string, value: boolean): Promise<void> {
  await patchDossier(profileId, ownerUid, { consentSensitive: value });
  const now = new Date().toISOString();
  await getFirestore().collection("consents").doc(profileId).set(
    { profileId, ownerUid, sensitiveDataConsent: value, consentAt: now },
    { merge: true },
  );
}

/** Apply a confirmed (or non-sensitive) fact into the resolved summary doc. */
function applyFactToSummary(dossier: Dossier, fact: Pick<DossierFact, "key" | "value">): Partial<Dossier> {
  const { key, value } = fact;
  if (ARRAY_KEYS.has(key)) {
    const arr = new Set([...(dossier[key as "interests"] ?? []), value]);
    return { [key]: Array.from(arr).slice(0, 20) } as Partial<Dossier>;
  }
  if (key === "hasKids") return { hasKids: value === "true" || value === "yes" };
  if (SUMMARY_KEYS.has(key)) return { [key]: value } as Partial<Dossier>;
  return {};
}

/**
 * Append a provenance-tracked fact. Non-sensitive (or already-confirmed) facts
 * also update the resolved summary. Sensitive facts are stored unconfirmed and
 * NOT reflected in the summary until confirmed.
 */
export async function appendFact(
  profileId: string,
  ownerUid: string,
  input: { key: string; value: string; source: DossierFact["source"]; sourceRef?: string | null; sensitive?: boolean; confirmed?: boolean; confidence?: number },
): Promise<DossierFact> {
  const dossier = await getDossier(profileId, ownerUid);
  const now = new Date().toISOString();
  const docRef = factsRef(profileId).doc();
  const fact: DossierFact = {
    id: docRef.id,
    key: input.key,
    value: input.value,
    source: input.source,
    sourceRef: input.sourceRef ?? null,
    sensitive: input.sensitive ?? false,
    confirmed: input.confirmed ?? !(input.sensitive ?? false),
    confidence: input.confidence ?? (input.source === "inferred" ? 0.5 : 0.9),
    createdAt: now,
    supersededAt: null,
  };
  await docRef.set(fact);
  if (fact.confirmed) {
    const patch = applyFactToSummary(dossier, fact);
    if (Object.keys(patch).length) await dossierRef(profileId).set({ ...patch, updatedAt: now }, { merge: true });
  }
  return fact;
}

export async function listFacts(profileId: string): Promise<DossierFact[]> {
  const snap = await factsRef(profileId).where("supersededAt", "==", null).get();
  return snap.docs.map((d) => d.data() as DossierFact).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function confirmFact(profileId: string, ownerUid: string, factId: string): Promise<void> {
  const ref = factsRef(profileId).doc(factId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const fact = snap.data() as DossierFact;
  await ref.set({ confirmed: true }, { merge: true });
  const dossier = await getDossier(profileId, ownerUid);
  const patch = applyFactToSummary(dossier, fact);
  if (Object.keys(patch).length) await dossierRef(profileId).set({ ...patch, updatedAt: new Date().toISOString() }, { merge: true });
}

export async function deleteFact(profileId: string, factId: string): Promise<void> {
  await factsRef(profileId).doc(factId).delete();
}

/** EMA-update the learned communication register (gradual drift). */
export async function updateStyleProfileEMA(
  profileId: string,
  ownerUid: string,
  signals: Partial<StyleProfile>,
  alpha = 0.2,
): Promise<void> {
  const dossier = await getDossier(profileId, ownerUid);
  const base = dossier.styleProfile ?? defaultStyleProfile();
  const next: StyleProfile = { ...base };
  for (const k of Object.keys(signals) as (keyof StyleProfile)[]) {
    const s = signals[k];
    if (typeof s === "number") next[k] = Math.min(1, Math.max(0, base[k] * (1 - alpha) + s * alpha));
  }
  await dossierRef(profileId).set({ styleProfile: next, updatedAt: new Date().toISOString() }, { merge: true });
}

/** Compact text block of what we know — injected into Oracle/letter prompts. */
export async function getDossierSummaryText(profileId: string): Promise<string> {
  const snap = await dossierRef(profileId).get();
  if (!snap.exists) return "";
  const d = snap.data() as Dossier;
  const lines: string[] = [];
  if (d.addressForm) lines.push(`Грамматический род/обращение: ${d.addressForm}`);
  if (d.locationCurrent?.place) lines.push(`Текущее место жизни: ${d.locationCurrent.place}`);
  if (d.relationshipStatus) lines.push(`Статус отношений: ${d.relationshipStatus}`);
  if (d.hasKids !== null) lines.push(`Дети: ${d.hasKids ? "есть" : "нет"}`);
  if (d.occupation) lines.push(`Род занятий: ${d.occupation}`);
  if (d.interests.length) lines.push(`Интересы: ${d.interests.join(", ")}`);
  if (d.goals.length) lines.push(`Цели: ${d.goals.join(", ")}`);
  if (d.openLoops.length) lines.push(`Открытые темы (континуитет): ${d.openLoops.join("; ")}`);
  // Confirmed, non-superseded free-form facts that are safe to use.
  const facts = await listFacts(profileId);
  for (const f of facts) {
    if (!f.confirmed) continue;
    if (SUMMARY_KEYS.has(f.key) || ARRAY_KEYS.has(f.key)) continue;
    lines.push(`${f.key}: ${f.value}`);
  }
  return lines.join("\n");
}

/** Delete the entire dossier (facts + summary) and the server-side oracle history. */
export async function forgetDossier(profileId: string): Promise<void> {
  const db = getFirestore();
  const factsSnap = await factsRef(profileId).get();
  const batch = db.batch();
  factsSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(dossierRef(profileId));
  await batch.commit();
  // Oracle history (separate collection).
  const histSnap = await db.collection("oracleHistory").doc(profileId).collection("items").get();
  const batch2 = db.batch();
  histSnap.docs.forEach((d) => batch2.delete(d.ref));
  await batch2.commit();
}

/** Gather everything we hold about a chart (GDPR export). */
export async function exportDossier(profileId: string): Promise<unknown> {
  const db = getFirestore();
  const [dossierSnap, factsSnap, histSnap, consentSnap] = await Promise.all([
    dossierRef(profileId).get(),
    factsRef(profileId).get(),
    db.collection("oracleHistory").doc(profileId).collection("items").get(),
    db.collection("consents").doc(profileId).get(),
  ]);
  return {
    dossier: dossierSnap.exists ? dossierSnap.data() : null,
    facts: factsSnap.docs.map((d) => d.data()),
    oracleHistory: histSnap.docs.map((d) => d.data()),
    consent: consentSnap.exists ? consentSnap.data() : null,
  };
}

/** Persist an Oracle Q/A to server-side history (for learning + continuity). */
export async function recordOracleHistory(
  profileId: string,
  entry: { question: string; answer: string; model: string; channel: "web" | "letter" },
): Promise<string> {
  const ref = await getFirestore()
    .collection("oracleHistory")
    .doc(profileId)
    .collection("items")
    .add({ ...entry, askedAt: new Date().toISOString() });
  return ref.id;
}
