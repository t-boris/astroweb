// Shared types -- keep in sync with web/src/types/index.ts

export interface Profile {
  id: string;
  ownerDeviceId: string;
  ownerUid?: string;
  archived?: boolean;
  name: string;
  birthDate: string; // YYYY-MM-DD
  birthTime: string | null; // HH:mm or null
  timeUnknown: boolean;
  birthPlace: string;
  lat: number;
  lng: number;
  timezone: string; // IANA timezone (e.g., "America/Chicago")
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  tokens?: number;
  hasPremiumPdf?: boolean;
  hasPremiumCompatibility?: boolean;
  oracleCredits?: number;
  relocationEnabled?: boolean;
  currentPlace?: string;
  currentLat?: number;
  currentLng?: number;
  /** Set by `listProfiles` for an account with a subscription on this profile. */
  subscription?: ProfileSubscription;
}

/**
 * The state of a profile's Personal Astrologer subscription as the profile list shows it. Added to the
 * profile by `listProfiles` for signed-in callers; never stored on the profile and never sent by a client.
 * - active: letters are being written
 * - ending: cancelled, access stays until `until`
 * - paused: letters are on hold
 * - past_due: the last payment failed
 * A cancelled or ended subscription has no summary at all.
 */
export interface ProfileSubscription {
  state: "active" | "ending" | "paused" | "past_due";
  /** Letter cadence key ("daily", "every_2_days", ...); empty when the record has none. */
  cadence: string;
  /** End of the paid period (ISO 8601) or null. */
  until: string | null;
}

export interface CreateProfilePayload {
  ownerDeviceId: string;
  ownerUid?: string;
  name: string;
  birthDate: string;
  birthTime: string | null;
  timeUnknown: boolean;
  birthPlace: string;
  lat: number;
  lng: number;
  timezone?: string; // Optional — server resolves from lat/lng if not provided
  relocationEnabled?: boolean;
  currentPlace?: string;
  currentLat?: number;
  currentLng?: number;
}

// Chart types live in the shared package (packages/chart-core/src/types.ts).
export type {
  ChartPoint,
  ChartHouses,
  ChartAspect,
  ChartMeta,
  SharedAspectType,
  PositionId,
  ChartPosition,
  ChartAngles,
  SharedAspect,
  ChartContext,
  ChartResult,
} from "../vendor/chart-core";
import type { ChartResult } from "../vendor/chart-core";

export interface UpdateProfilePayload {
  ownerDeviceId: string;
  name?: string;
  birthDate?: string;
  birthTime?: string | null;
  timeUnknown?: boolean;
  birthPlace?: string;
  lat?: number;
  lng?: number;
  timezone?: string;
  relocationEnabled?: boolean;
  currentPlace?: string;
  currentLat?: number;
  currentLng?: number;
}

export interface ChartDocument {
  id: string;
  profileId: string;
  type: "natal"; // Future: "synastry", "transit"
  computedAt: string; // ISO 8601
  inputHash: string; // Hash of computation inputs (for cache hit)
  result: ChartResult;
}

export interface ApiError {
  code: string; // Machine-readable: "INVALID_PAYLOAD", "NOT_FOUND", "FORBIDDEN"
  message: string; // Human-readable description
  field?: string; // Which field failed validation (optional)
}

// ---- Personal Astrologer -----------------------------------------------------

/** Learned communication register (each 0..1). Evolves via EMA. */
export interface StyleProfile {
  humor: number;
  seriousness: number;
  formality: number;
  warmth: number;
  brevity: number;
  mysticism: number;
  emoji: number;
}

export type AddressForm = "masculine" | "feminine" | "neutral";
export type RelationshipStatus = "single" | "relationship" | "married" | "complicated";

/** Resolved per-chart dossier summary (one doc per profile). */
export interface Dossier {
  profileId: string;
  ownerUid: string;
  language: "ru" | "en";
  addressForm: AddressForm | null;
  locationCurrent: { place: string; lat: number; lng: number; timezone: string } | null;
  relationshipStatus: RelationshipStatus | null;
  hasKids: boolean | null;
  occupation: string | null;
  interests: string[];
  goals: string[];
  openLoops: string[];
  styleProfile: StyleProfile | null;
  styleNudge: "more_serious" | "more_playful" | null;
  consentSensitive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A single provenance-tracked fact in the dossier facts log. */
export interface DossierFact {
  id: string;
  key: string; // e.g. "relationshipStatus", "occupation", or a free-form key
  value: string;
  source: "onboarding" | "tap" | "inferred";
  sourceRef: string | null; // questionId / letterId that produced it
  sensitive: boolean;
  confirmed: boolean; // sensitive facts require confirmed=true to be used
  confidence: number; // 0..1
  createdAt: string;
  supersededAt: string | null;
}
