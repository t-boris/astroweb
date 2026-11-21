import { describe, expect, it } from "vitest";
import { formatDay, formatDayTime, formatPeriodEnd } from "@/lib/subscriptionDates";

/** The dates of the subscription cards follow the interface language, never the browser's own setting. */

const MOMENT = "2026-07-03T12:00:00.000Z"; // midday UTC: the same calendar day in nearly every time zone
const NOW = Date.parse("2026-11-21T12:00:00.000Z");

describe("formatDay", () => {
  it("writes the month as a word in the language of the interface, so 7/3 can never be read two ways", () => {
    expect(formatDay(MOMENT, "ru")).toMatch(/июл/);
    expect(formatDay(MOMENT, "en")).toMatch(/Jul/);
    expect(formatDay(MOMENT, "ru")).not.toMatch(/^\d+\/\d+\/\d+$/);
    expect(formatDay(MOMENT, "en")).not.toMatch(/^\d+\/\d+\/\d+$/);
  });

  it("matches the Intl rendering of that language", () => {
    expect(formatDay(MOMENT, "ru")).toBe(new Intl.DateTimeFormat("ru", { dateStyle: "medium" }).format(new Date(MOMENT)));
  });

  it("is empty for a missing or unreadable value and survives an unknown language", () => {
    expect(formatDay(null, "en")).toBe("");
    expect(formatDay(undefined, "en")).toBe("");
    expect(formatDay("", "en")).toBe("");
    expect(formatDay("not a date", "en")).toBe("");
    expect(formatDay(MOMENT, "xx-invalid-language-tag-!!")).not.toBe("");
  });
});

describe("formatDayTime", () => {
  it("has the day and the time without seconds, in the language of the interface", () => {
    const ru = formatDayTime("2026-11-21T21:00:35.000Z", "ru");
    expect(ru).toMatch(/нояб/);
    expect(ru).not.toMatch(/:35/);
    expect(ru).toBe(new Intl.DateTimeFormat("ru", { dateStyle: "medium", timeStyle: "short" }).format(new Date("2026-11-21T21:00:35.000Z")));
    expect(formatDayTime("2026-11-21T21:00:35.000Z", "en")).not.toMatch(/:35/);
  });

  it("is empty for a missing or unreadable value", () => {
    expect(formatDayTime(null, "ru")).toBe("");
    expect(formatDayTime("nope", "ru")).toBe("");
  });
});

describe("formatPeriodEnd", () => {
  it("shows the end of the period while it is ahead", () => {
    expect(formatPeriodEnd("2026-12-05T12:00:00.000Z", "en", NOW)).toMatch(/Dec/);
  });

  it("leaves out a period end that is past, the epoch of a failed read, missing or unreadable", () => {
    expect(formatPeriodEnd(MOMENT, "en", NOW)).toBe("");
    expect(formatPeriodEnd("1970-01-01T00:00:00.000Z", "en", NOW)).toBe("");
    expect(formatPeriodEnd(null, "en", NOW)).toBe("");
    expect(formatPeriodEnd(undefined, "en", NOW)).toBe("");
    expect(formatPeriodEnd("nope", "en", NOW)).toBe("");
  });

  it("treats the exact present moment as already over", () => {
    expect(formatPeriodEnd(new Date(NOW).toISOString(), "en", NOW)).toBe("");
  });
});
