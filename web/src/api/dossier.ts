import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import type { Dossier, DossierFact } from "@/types";

export async function getDossier(profileId: string): Promise<{ dossier: Dossier; facts: DossierFact[] }> {
  const fn = httpsCallable<{ profileId: string }, { dossier: Dossier; facts: DossierFact[] }>(functions, "getDossierData");
  return (await fn({ profileId })).data;
}

export async function updateDossier(profileId: string, patch: Partial<Dossier>): Promise<Dossier> {
  const fn = httpsCallable<{ profileId: string; patch: Partial<Dossier> }, { ok: boolean; dossier: Dossier }>(functions, "updateDossier");
  return (await fn({ profileId, patch })).data.dossier;
}

export async function setDossierInterests(profileId: string, tags: string[]): Promise<Dossier> {
  const fn = httpsCallable<{ profileId: string; tags: string[] }, { ok: boolean; dossier: Dossier }>(functions, "setDossierInterests");
  return (await fn({ profileId, tags })).data.dossier;
}

export async function setDossierConsent(profileId: string, value: boolean): Promise<void> {
  const fn = httpsCallable<{ profileId: string; value: boolean }, { ok: boolean }>(functions, "setDossierConsent");
  await fn({ profileId, value });
}

export async function addDossierFact(profileId: string, key: string, value: string, sensitive = false): Promise<DossierFact> {
  const fn = httpsCallable<{ profileId: string; key: string; value: string; sensitive: boolean }, { ok: boolean; fact: DossierFact }>(functions, "addDossierFact");
  return (await fn({ profileId, key, value, sensitive })).data.fact;
}

export async function confirmDossierFact(profileId: string, factId: string): Promise<void> {
  const fn = httpsCallable<{ profileId: string; factId: string }, { ok: boolean }>(functions, "confirmDossierFact");
  await fn({ profileId, factId });
}

export async function deleteDossierFact(profileId: string, factId: string): Promise<void> {
  const fn = httpsCallable<{ profileId: string; factId: string }, { ok: boolean }>(functions, "deleteDossierFact");
  await fn({ profileId, factId });
}

export async function forgetDossier(profileId: string): Promise<void> {
  const fn = httpsCallable<{ profileId: string }, { ok: boolean }>(functions, "forgetDossierData");
  await fn({ profileId });
}

export async function exportUserData(profileId: string): Promise<unknown> {
  const fn = httpsCallable<{ profileId: string }, { ok: boolean; data: unknown }>(functions, "exportUserData");
  return (await fn({ profileId })).data.data;
}
