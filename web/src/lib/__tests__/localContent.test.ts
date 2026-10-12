import { describe, expect, it } from "vitest";
import {
  aiKey,
  buildUploadPayload,
  clearLocalContent,
  compatKey,
  isEmpty,
  keepLocally,
  readLocalContent,
  writeLocalContent,
} from "@/lib/localContent";
import { shouldShowSignInNotice } from "@/lib/signInNotice";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: (k: string) => {
      delete data[k];
    },
  };
}

const oracle = { question: "Q?", answer: "Answer\n[END_OF_REPORT]", model: "m", askedAt: "2026-10-01T00:00:00.000Z" };
const compat = { partnerName: "Alex", partnerBirthDate: "1991-02-03", partnerBirthPlace: "Berlin", answer: "Fit", partnerTimezone: null, generatedAt: "2026-10-01T00:00:00.000Z" };

describe("local-only content (REQ-007)", () => {
  it("reads the legacy keys and cleans generation artifacts", () => {
    const s = memoryStorage({
      [aiKey("p1")]: JSON.stringify({ deepTexts: { sun: "Deep\n[END_OF_REPORT]", empty: "  " }, oracleHistory: [oracle, { broken: true }] }),
      [compatKey("p1")]: JSON.stringify([compat, { partnerName: 1 }]),
    });
    const c = readLocalContent(s, "p1");
    expect(c.deepTexts).toEqual({ sun: "Deep" });
    expect(c.oracleHistory).toEqual([{ ...oracle, answer: "Answer" }]);
    expect(c.compatibilityReadings).toEqual([compat]);
  });

  it("survives corrupt or missing storage", () => {
    const s = memoryStorage({ [aiKey("p1")]: "{not json", [compatKey("p1")]: "42" });
    expect(isEmpty(readLocalContent(s, "p1"))).toBe(true);
    expect(isEmpty(readLocalContent(memoryStorage(), "p2"))).toBe(true);
  });

  it("builds an upload payload only when there is something to upload", () => {
    expect(buildUploadPayload({ deepTexts: {}, oracleHistory: [], compatibilityReadings: [] }, "ru")).toBeNull();
    const p = buildUploadPayload({ deepTexts: { sun: "Deep" }, oracleHistory: [oracle], compatibilityReadings: [compat] }, "ru");
    expect(p).toEqual({
      deepTexts: [{ blockKey: "sun", text: "Deep", language: "ru" }],
      oracleHistory: [oracle],
      compatibilityReadings: [compat],
    });
  });

  it("clears the local copy after a successful upload", () => {
    const s = memoryStorage();
    writeLocalContent(s, "p1", { deepTexts: { sun: "Deep" }, oracleHistory: [oracle], compatibilityReadings: [compat] });
    expect(Object.keys(s.data).sort()).toEqual([aiKey("p1"), compatKey("p1")].sort());
    clearLocalContent(s, "p1");
    expect(s.data).toEqual({});
  });

  it("keeps a single failed server write locally, next to existing content", () => {
    const s = memoryStorage();
    writeLocalContent(s, "p1", { deepTexts: { sun: "Deep" }, oracleHistory: [], compatibilityReadings: [] });
    keepLocally(s, "p1", { oracle });
    keepLocally(s, "p1", { compat });
    keepLocally(s, "p1", { deepText: { blockKey: "moon", text: "Moon" } });
    const c = readLocalContent(s, "p1");
    expect(Object.keys(c.deepTexts).sort()).toEqual(["moon", "sun"]);
    expect(c.oracleHistory).toHaveLength(1);
    expect(c.compatibilityReadings).toHaveLength(1);
  });
});

describe("sign-in notice visibility (REQ-008)", () => {
  it("shows only to anonymous users who have a profile, once auth is known", () => {
    expect(shouldShowSignInNotice({ authReady: true, signedIn: false, profileCount: 1 })).toBe(true);
    expect(shouldShowSignInNotice({ authReady: true, signedIn: true, profileCount: 3 })).toBe(false);
    expect(shouldShowSignInNotice({ authReady: true, signedIn: false, profileCount: 0 })).toBe(false);
    expect(shouldShowSignInNotice({ authReady: false, signedIn: false, profileCount: 2 })).toBe(false);
  });
});
