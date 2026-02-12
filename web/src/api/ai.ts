import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

interface DeepenInterpretationPayload {
  profileId: string;
  ownerDeviceId: string;
  focusTopic: string;
  baseInterpretation: string;
  language?: "ru" | "en";
  relocationLat?: number;
  relocationLng?: number;
}

interface DeepenInterpretationResponse {
  text: string;
  model: string;
}

interface AskOraclePayload {
  profileId: string;
  ownerDeviceId: string;
  question: string;
  language?: "ru" | "en";
  relocationLat?: number;
  relocationLng?: number;
}

interface AskOracleResponse {
  answer: string;
  model: string;
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
  language?: "ru" | "en";
  relocationLat?: number;
  relocationLng?: number;
}

interface AskRelationshipResponse {
  answer: string;
  model: string;
  partnerTimezone: string;
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
