import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

export interface ServerOracleEntry {
  id: string;
  question: string;
  answer: string;
  model: string;
  askedAt: string;
  channel: string;
}

export interface ServerCompatReading {
  id: string;
  partnerName: string;
  partnerBirthDate: string;
  partnerBirthPlace: string;
  answer: string;
  partnerTimezone: string | null;
  generatedAt: string;
}

export interface ServerProfileContent {
  deepTexts: Record<string, { text: string; language: string }>;
  compatibilityReadings: ServerCompatReading[];
  oracleHistory: ServerOracleEntry[];
}

export interface UploadPayload {
  deepTexts: Array<{ blockKey: string; text: string; language: string }>;
  oracleHistory: Array<{ question: string; answer: string; model: string; askedAt: string }>;
  compatibilityReadings: Array<Omit<ServerCompatReading, "id">>;
}

export async function getProfileContent(profileId: string, ownerDeviceId: string): Promise<ServerProfileContent> {
  const fn = httpsCallable<{ profileId: string; ownerDeviceId: string }, ServerProfileContent>(functions, "getProfileContent");
  return (await fn({ profileId, ownerDeviceId })).data;
}

export async function uploadLocalContent(profileId: string, payload: UploadPayload): Promise<void> {
  await httpsCallable(functions, "uploadLocalContent")({ profileId, ...payload });
}

export async function deleteProfileContentItem(
  profileId: string,
  ownerDeviceId: string,
  kind: "oracle" | "compatibility",
  id: string,
): Promise<void> {
  await httpsCallable(functions, "deleteProfileContentItem")({ profileId, ownerDeviceId, kind, id });
}
