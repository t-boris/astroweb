import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PictureError } from "@/lib/chartPicture";
import {
  NOT_READ_REASONS,
  coordinatesLabel,
  failureTextKey,
  formatBirthDay,
  profilePrefill,
  readFailureOf,
  readProfilePrefill,
  roundAccuracy,
  wasRefunded,
  type ReadFailure,
} from "@/lib/explainChart";
import type { RecoveredBirth } from "@/types";

/** Explain my natal chart, the page logic: failures, the birth in words, the profile prefill (REQ-001, DEC-004). */

const WEB = join(__dirname, "..", "..", "..");
const locale = (lang: "en" | "ru") =>
  JSON.parse(readFileSync(join(WEB, "public", "locales", lang, "translation.json"), "utf-8")) as Record<string, unknown>;

/** A callable error as the Firebase SDK throws it. */
function callableError(code: string, message: string, details?: unknown) {
  return Object.assign(new Error(message), { code: `functions/${code}`, details });
}

const CAPE_TOWN: RecoveredBirth = {
  status: "matched",
  birthDate: "2002-03-30",
  birthTime: "03:30",
  timezone: "Africa/Johannesburg",
  utc: "2002-03-30T01:30:20Z",
  lat: -33.913,
  lng: 18.335,
  timeAccuracyMinutes: 0.8,
  placeAccuracyKm: 20.1,
};

describe("what a failed reading means", () => {
  it("tells a picture that gave no birth by the server's reason, and an unknown reason as unreadable", () => {
    expect(readFailureOf(callableError("failed-precondition", "CHART_NOT_READ", { reason: "missing_angles" }))).toEqual({
      kind: "not_read",
      reason: "missing_angles",
    });
    expect(readFailureOf(callableError("failed-precondition", "CHART_NOT_READ", { reason: "something_new" }))).toEqual({
      kind: "not_read",
      reason: "unreadable",
    });
  });

  it("tells a short balance from a picture with no birth, though both are failed-precondition", () => {
    expect(readFailureOf(callableError("failed-precondition", "INSUFFICIENT_TOKENS"))).toEqual({ kind: "no_stars" });
  });

  it("maps the other server answers and the picture errors of the page", () => {
    expect(readFailureOf(callableError("resource-exhausted", "TOO_MANY_FAILED_READINGS"))).toEqual({ kind: "daily_limit" });
    expect(readFailureOf(callableError("aborted", "READING_IN_PROGRESS"))).toEqual({ kind: "in_progress" });
    expect(readFailureOf(callableError("invalid-argument", "IMAGE_TOO_LARGE"))).toEqual({ kind: "too_large" });
    expect(readFailureOf(callableError("invalid-argument", "UNSUPPORTED_IMAGE"))).toEqual({ kind: "unsupported" });
    expect(readFailureOf(callableError("unauthenticated", "Sign in required"))).toEqual({ kind: "signed_out" });
    expect(readFailureOf(callableError("internal", "CHART_READING_FAILED"))).toEqual({ kind: "failed" });
    expect(readFailureOf(callableError("deadline-exceeded", "deadline-exceeded"))).toEqual({ kind: "failed" });
    expect(readFailureOf(new PictureError("too_large"))).toEqual({ kind: "too_large" });
    expect(readFailureOf(new PictureError("unreadable"))).toEqual({ kind: "unsupported" });
    expect(readFailureOf(undefined)).toEqual({ kind: "failed" });
  });

  it("says the star came back only when the server refunds it", () => {
    expect(wasRefunded({ kind: "not_read", reason: "missing_moon" })).toBe(true);
    expect(wasRefunded({ kind: "failed" })).toBe(true);
    for (const kind of ["no_stars", "daily_limit", "in_progress", "too_large", "unsupported", "signed_out"] as const) {
      expect(wasRefunded({ kind }), kind).toBe(false);
    }
  });

  it("knows every reason the server can give (functions/src/api/chartReading.ts)", () => {
    const source = readFileSync(join(WEB, "..", "functions", "src", "api", "chartReading.ts"), "utf-8");
    const union = source.match(/export type ChartNotReadReason =([\s\S]*?);/)?.[1] ?? "";
    const serverReasons = [...union.matchAll(/\|\s*"([a-z_]+)"/g)].map((m) => m[1]);
    expect(serverReasons.length).toBeGreaterThan(5);
    expect([...NOT_READ_REASONS].sort()).toEqual([...serverReasons].sort());
  });

  it("has a message for every failure in both languages", () => {
    const failures: ReadFailure[] = [
      ...NOT_READ_REASONS.map((reason) => ({ kind: "not_read", reason }) as const),
      ...(["failed", "no_stars", "daily_limit", "in_progress", "too_large", "unsupported", "signed_out"] as const).map((kind) => ({ kind })),
    ];
    for (const lang of ["en", "ru"] as const) {
      const all = locale(lang);
      for (const failure of failures) {
        const value = failureTextKey(failure)
          .split(".")
          .reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], all);
        expect(typeof value === "string" && value.trim() !== "", `${lang}: ${failureTextKey(failure)}`).toBe(true);
      }
    }
  });

  it("asks for ASC and MC by name when they are missing (owner's choice, DEC-004)", () => {
    const en = (locale("en").explainChart as { failure: Record<string, string> }).failure.missing_angles;
    const ru = (locale("ru").explainChart as { failure: Record<string, string> }).failure.missing_angles;
    for (const text of [en, ru]) {
      expect(text).toContain("ASC");
      expect(text).toContain("MC");
    }
  });
});

describe("the recovered birth in words", () => {
  it("writes the date with the month as a word, in the interface language, without a time-zone shift", () => {
    expect(formatBirthDay("2002-03-30", "en")).toBe("March 30, 2002");
    expect(formatBirthDay("2002-03-30", "ru")).toMatch(/^30 марта 2002/);
    expect(formatBirthDay("1985-01-01", "en")).toBe("January 1, 1985");
  });

  it("rounds an accuracy up to whole units, never below 1", () => {
    expect(roundAccuracy(0.8)).toBe(1);
    expect(roundAccuracy(20.1)).toBe(21);
    expect(roundAccuracy(0)).toBe(1);
  });

  it("names a place by its coordinates when there is no name", () => {
    expect(coordinatesLabel(-33.913, 18.335)).toBe("33.9°S 18.3°E");
    expect(coordinatesLabel(40.7, -74.0)).toBe("40.7°N 74.0°W");
  });
});

describe("the profile form filled in from a reading", () => {
  it("carries the local date and time, the place name (or the coordinates) and the solved coordinates", () => {
    expect(profilePrefill(CAPE_TOWN, "Cape Town, Western Cape, South Africa")).toEqual({
      birthDate: "2002-03-30",
      birthTime: "03:30",
      birthPlace: "Cape Town, Western Cape, South Africa",
      lat: -33.913,
      lng: 18.335,
    });
    expect(profilePrefill(CAPE_TOWN, null).birthPlace).toBe("33.9°S 18.3°E");
    expect(profilePrefill(CAPE_TOWN, "  ").birthPlace).toBe("33.9°S 18.3°E");
  });

  it("takes only a well-formed prefill from the router state", () => {
    const good = profilePrefill(CAPE_TOWN, "Cape Town");
    expect(readProfilePrefill({ prefill: good })).toEqual(good);
    expect(readProfilePrefill(null)).toBeNull();
    expect(readProfilePrefill({})).toBeNull();
    expect(readProfilePrefill({ prefill: { ...good, birthDate: "30.03.2002" } })).toBeNull();
    expect(readProfilePrefill({ prefill: { ...good, birthTime: "3:30 AM" } })).toBeNull();
    expect(readProfilePrefill({ prefill: { ...good, lat: 91 } })).toBeNull();
    expect(readProfilePrefill({ prefill: { ...good, lng: Number.NaN } })).toBeNull();
    expect(readProfilePrefill({ prefill: { ...good, birthPlace: "" } })).toBeNull();
  });
});

describe("the page texts", () => {
  type Tree = { [key: string]: string | Tree };
  const leaves = (tree: Tree, prefix = ""): Record<string, string> =>
    Object.entries(tree).reduce<Record<string, string>>((out, [key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof value === "string" ? { ...out, [path]: value } : { ...out, ...leaves(value, path) };
    }, {});
  const en = leaves(locale("en").explainChart as Tree);
  const ru = leaves(locale("ru").explainChart as Tree);

  it("have the same keys, none empty, in English and Russian", () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
    expect([...Object.values(en), ...Object.values(ru)].filter((v) => v.trim() === "")).toEqual([]);
  });

  it("use the same placeholders in both languages", () => {
    const placeholders = (v: string) => [...v.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    const differing = Object.keys(en).filter((k) => placeholders(en[k]).join() !== placeholders(ru[k]).join());
    expect(differing).toEqual([]);
  });

  it("name the feature as the owner asked", () => {
    expect(en.title).toBe("Explain my natal chart");
    expect(ru.title).toBe("Объясни мою натальную карту");
  });
});
