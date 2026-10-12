import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import type { AppLanguage } from "@/lib/language";

interface DeepenInterpretationPayload {
  profileId: string;
  ownerDeviceId: string;
  focusTopic: string;
  baseInterpretation: string;
  language?: AppLanguage;
  relocationLat?: number;
  relocationLng?: number;
  /** Interpretation block the text belongs to; the server stores it per block for signed-in owners. */
  blockKey?: string;
}

interface DeepenInterpretationResponse {
  text: string;
  model: string;
  /** True when the text was stored on the server (signed-in owner). */
  persisted?: boolean;
}

interface AskOraclePayload {
  profileId: string;
  ownerDeviceId: string;
  question: string;
  language?: AppLanguage;
  relocationLat?: number;
  relocationLng?: number;
}

interface AskOracleResponse {
  answer: string;
  model: string;
  /** Id of the stored history entry (null if the server write failed). */
  entryId?: string | null;
  persisted?: boolean;
}

interface RelationshipPartnerPayload {
  name: string;
  birthDate: string;
  birthTime: string | null;
  timeUnknown: boolean;
  birthPlace: string;
  lat: number;
  lng: number;
}

interface AskRelationshipPayload {
  profileId: string;
  ownerDeviceId: string;
  partner: RelationshipPartnerPayload;
  language?: AppLanguage;
  relocationLat?: number;
  relocationLng?: number;
}

interface AskRelationshipResponse {
  answer: string;
  model: string;
  partnerTimezone: string;
  generatedAt?: string;
  readingId?: string | null;
  persisted?: boolean;
}

export async function deepenInterpretation(
  payload: DeepenInterpretationPayload,
): Promise<DeepenInterpretationResponse> {
  const fn = httpsCallable<
    DeepenInterpretationPayload,
    DeepenInterpretationResponse
  >(functions, "deepenInterpretation");

  const result = await fn(payload);
  return result.data;
}

export async function askOracle(payload: AskOraclePayload): Promise<AskOracleResponse> {
  const fn = httpsCallable<AskOraclePayload, AskOracleResponse>(
    functions,
    "askOracle",
  );

  const result = await fn(payload);
  return result.data;
}

export async function askRelationship(
  payload: AskRelationshipPayload,
): Promise<AskRelationshipResponse> {
  const fn = httpsCallable<AskRelationshipPayload, AskRelationshipResponse>(
    functions,
    "askRelationship",
  );

  const result = await fn(payload);
  return result.data;
}
