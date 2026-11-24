import { PictureError } from "@/lib/chartPicture";
import { dateLocale, type AppLanguage } from "@/lib/language";
import type { RecoveredBirth } from "@/types";

/**
 * Explain my natal chart, the page side: what a failed reading means for the user, the recovered birth in words,
 * and the prefill of the profile form. Pure, so it is tested without a browser.
 */

/** Reasons the server gives when a picture yields no birth (functions/src/api/chartReading.ts); the star is refunded. */
export const NOT_READ_REASONS = [
  "unreadable",
  "not_a_chart",
  "sidereal",
  "missing_angles",
  "missing_moon",
  "missing_sun",
  "too_few_points",
  "no_consistent_moment",
  "no_place",
] as const;
export type NotReadReason = (typeof NOT_READ_REASONS)[number];

export type ReadFailure =
  /** The picture gave no birth; the star was refunded. */
  | { kind: "not_read"; reason: NotReadReason }
  /** Something failed on our side; the star was refunded. */
  | { kind: "failed" }
  | { kind: "no_stars" }
  | { kind: "daily_limit" }
  | { kind: "in_progress" }
  | { kind: "too_large" }
  | { kind: "unsupported" }
  | { kind: "signed_out" };

/** Whether the star spent on the attempt went back to the wallet. */
export function wasRefunded(failure: ReadFailure): boolean {
  return failure.kind === "not_read" || failure.kind === "failed";
}

/** The failure a thrown error stands for: a callable error of readChartImage, or a picture that could not be prepared. */
export function readFailureOf(error: unknown): ReadFailure {
  if (error instanceof PictureError) return { kind: error.reason === "too_large" ? "too_large" : "unsupported" };
  const e = (error ?? {}) as { code?: unknown; message?: unknown; details?: unknown };
  const code = typeof e.code === "string" ? e.code.replace(/^functions\//, "") : "";
  const message = typeof e.message === "string" ? e.message : "";
  switch (code) {
    case "failed-precondition": {
      if (message.includes("INSUFFICIENT_TOKENS")) return { kind: "no_stars" };
      const reason = (e.details as { reason?: unknown } | null | undefined)?.reason;
      const known = NOT_READ_REASONS.find((r) => r === reason);
      return { kind: "not_read", reason: known ?? "unreadable" };
    }
    case "resource-exhausted":
      return { kind: "daily_limit" };
    case "aborted":
      return { kind: "in_progress" };
    case "invalid-argument":
      return { kind: message.includes("IMAGE_TOO_LARGE") ? "too_large" : "unsupported" };
    case "unauthenticated":
      return { kind: "signed_out" };
    default:
      return { kind: "failed" };
  }
}

/** The translation key of the message for a failure. */
export function failureTextKey(failure: ReadFailure): string {
  return failure.kind === "not_read" ? `explainChart.failure.${failure.reason}` : `explainChart.failure.${failure.kind}`;
}

/** "March 30, 2002" / "30 марта 2002 г.": a calendar date, never shifted by the viewer's time zone. */
export function formatBirthDay(isoDate: string, language: AppLanguage): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Intl.DateTimeFormat(dateLocale(language), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

/** An accuracy shown to the user: whole units, rounded up, at least 1. */
export function roundAccuracy(value: number): number {
  return Math.max(1, Math.ceil(value));
}

/** "33.9°S 18.3°E": the place when Photon names none. */
export function coordinatesLabel(lat: number, lng: number): string {
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lng).toFixed(1)}°${lng >= 0 ? "E" : "W"}`;
}

/** What the profile form is filled with when a recovered birth is saved as a profile. */
export interface ProfilePrefill {
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  lat: number;
  lng: number;
}

export function profilePrefill(birth: RecoveredBirth, placeName: string | null): ProfilePrefill {
  return {
    birthDate: birth.birthDate,
    birthTime: birth.birthTime,
    birthPlace: placeName?.trim() || coordinatesLabel(birth.lat, birth.lng),
    lat: birth.lat,
    lng: birth.lng,
  };
}

/** The prefill carried in the router state of /profile/new, checked: the state survives reloads and history moves. */
export function readProfilePrefill(state: unknown): ProfilePrefill | null {
  const p = (state as { prefill?: unknown } | null | undefined)?.prefill as Partial<ProfilePrefill> | undefined;
  if (!p || typeof p !== "object") return null;
  const ok =
    typeof p.birthDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(p.birthDate) &&
    typeof p.birthTime === "string" &&
    /^\d{2}:\d{2}$/.test(p.birthTime) &&
    typeof p.birthPlace === "string" &&
    p.birthPlace.trim() !== "" &&
    typeof p.lat === "number" &&
    Number.isFinite(p.lat) &&
    Math.abs(p.lat) <= 90 &&
    typeof p.lng === "number" &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lng) <= 180;
  return ok ? { birthDate: p.birthDate!, birthTime: p.birthTime!, birthPlace: p.birthPlace!.slice(0, 200), lat: p.lat!, lng: p.lng! } : null;
}
