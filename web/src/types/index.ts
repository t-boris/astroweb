// Shared types -- keep in sync with functions/src/types/index.ts

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

// ---- Personal Astrologer -----------------------------------------------------

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

export interface DossierFact {
  id: string;
  key: string;
  value: string;
  source: "onboarding" | "tap" | "inferred";
  sourceRef: string | null;
  sensitive: boolean;
  confirmed: boolean;
  confidence: number;
  createdAt: string;
  supersededAt: string | null;
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
} from "@astroweb/chart-core";
import type { ChartResult } from "@astroweb/chart-core";

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

// ---- Explain my natal chart -----------------------------------------------------

/** A point the reading of a chart picture can report. */
export type ReadChartPointId =
  | "Sun" | "Moon" | "Mercury" | "Venus" | "Mars" | "Jupiter" | "Saturn" | "Uranus" | "Neptune" | "Pluto"
  | "NorthNode" | "Chiron" | "Lilith" | "ASC" | "MC";

/** One position as read from the picture, with the solver's verdict when the solver checks that point. */
export interface ReadChartPoint {
  id: ReadChartPointId;
  /** English sign name. */
  sign: string;
  degree: number;
  /** Printed arcminute; null when only degrees are printed or the position was judged from the glyph. */
  minute: number | null;
  retrograde: boolean | null;
  /** No number printed: placed by eye from the wheel. */
  estimated: boolean;
  /** Ecliptic longitude of the read value, degrees. */
  longitude: number;
  /** Width of the bin the read value stands for, degrees. */
  resolution: number;
  /** Set for the ten bodies, ASC and MC: whether the solved moment puts the point inside its bin. */
  matched?: boolean;
  /** Distance outside the bin at the solved moment, arcminutes (0 inside). */
  deviationArcmin?: number;
}

/**
 * The birth moment and place recovered from a chart picture. A picture is read only when it shows the
 * Moon, ASC and MC, so the time and the place are always known (DEC-004 of explain-my-natal-chart).
 */
export interface RecoveredBirth {
  /** "partial": some points did not fit and are listed as not matched. */
  status: "matched" | "partial";
  /** Local YYYY-MM-DD at the place. */
  birthDate: string;
  /** Local HH:mm at the place. */
  birthTime: string;
  timezone: string;
  /** The solved moment, ISO 8601 UTC. */
  utc: string;
  lat: number;
  lng: number;
  /** Half width of the time window, minutes. */
  timeAccuracyMinutes: number;
  /** Radius around lat/lng the true place lies in, km. */
  placeAccuracyKm: number;
}

export interface ChartPictureReading {
  zodiac: "tropical" | "sidereal" | "unknown";
  points: ReadChartPoint[];
  asc: ReadChartPoint | null;
  mc: ReadChartPoint | null;
  /** The model's note on what made the reading uncertain (English), or "". */
  notes: string;
}

/** Answer of readChartImage. */
export interface ChartReadingResult {
  readingId: string;
  birth: RecoveredBirth;
  reading: ChartPictureReading;
  /** The chart of the recovered birth (houses and angles only when the place is known). */
  chart: ChartResult;
  /** True when this call spent the star; false when the same picture had been read before. */
  charged: boolean;
}

/** Answer of describeChartReading. */
export interface ChartPortraitResult {
  readingId: string;
  language: "en" | "ru";
  text: string;
}
