// Shared types -- keep in sync with functions/src/types/index.ts

export interface Profile {
  id: string;
  ownerDeviceId: string;
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
  hasPremiumPdf?: boolean;
  hasPremiumCompatibility?: boolean;
  oracleCredits?: number;
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
}

export interface ChartPoint {
  body: string; // "Sun", "Moon", "Mercury", etc.
  lon: number; // Ecliptic longitude (0-360)
  sign: string; // "Aries", "Taurus", etc.
  degreeInSign: number; // 0-30
  house: number | null; // House number (1-12) or null if unknown
}

export interface ChartHouses {
  system: "placidus" | "koch" | "whole-sign";
  cusps: number[]; // 12 cusp longitudes (0-360)
  asc: number | null; // Ascendant longitude
  mc: number | null; // Midheaven longitude
}

export interface ChartAspect {
  a: string; // Body name A
  b: string; // Body name B
  type: "conjunction" | "opposition" | "trine" | "square" | "sextile";
  orb: number; // Actual orb in degrees
  exactness: number; // 0-1, how exact (1 = perfect)
}

export interface ChartMeta {
  houseSystem: "placidus" | "koch" | "whole-sign";
  zodiac: "tropical";
  timeUsed: string | null; // HH:mm or null
  timezoneUsed: string;
}

export interface ChartResult {
  meta: ChartMeta;
  points: ChartPoint[];
  houses: ChartHouses;
  aspects: ChartAspect[];
}

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
