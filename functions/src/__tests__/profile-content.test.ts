import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeFirestore, type FakeFirestore } from "./helpers/fakeFirestore";

const h = vi.hoisted(() => ({ fake: null as unknown as FakeFirestore }));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => h.fake.db,
  FieldValue: { serverTimestamp: () => "TS" },
}));

import {
  compatReadingId,
  deepTextId,
  deleteAllProfileContent,
  importLocalContent,
  oracleEntryKey,
  readProfileContent,
  sanitizeUploadPayload,
} from "../services/profileContent";
import { deleteProfileContentItem, getProfileContent, uploadLocalContent } from "../api/profileContent";
import { deleteProfile } from "../api/deleteProfile";

type Callable = { run: (req: unknown) => Promise<any> };
const run = (fn: unknown, data: Record<string, unknown>, uid: string | null) =>
  (fn as Callable).run({ data, auth: uid ? { uid } : undefined });

const items = (col: string, profileId = "p1") => h.fake.all(`${col}/${profileId}/items`);

const reading = (over: Record<string, unknown> = {}) => ({
  partnerName: "Alex",
  partnerBirthDate: "1991-02-03",
  partnerBirthPlace: "Berlin",
  answer: "You two fit.\n[END_OF_REPORT]",
  partnerTimezone: "Europe/Berlin",
  generatedAt: "2026-10-01T10:00:00.000Z",
  ...over,
});
const oracle = (over: Record<string, unknown> = {}) => ({
  question: "Will I travel?",
  answer: "Yes, in spring.",
  model: "claude",
  askedAt: "2026-10-02T10:00:00.000Z",
  ...over,
});
const fullPayload = () => ({
  profileId: "p1",
  deepTexts: [{ blockKey: "sun-in-aries", text: "Deep sun text", language: "ru" }],
  compatibilityReadings: [reading()],
  oracleHistory: [oracle()],
});

beforeEach(() => {
  h.fake = createFakeFirestore();
  h.fake.seed("profiles", "p1", { ownerUid: "u1", ownerDeviceId: "d1", name: "A" });
  h.fake.seed("profiles", "p2", { ownerDeviceId: "d2", name: "Unclaimed" });
  h.fake.seed("profiles", "p3", { ownerUid: "u2", ownerDeviceId: "d3", name: "Other" });
  h.fake.seed("wallets", "u1", { tokens: 5 });
});

describe("content identity (DEC-005)", () => {
  it("is stable and content-derived", () => {
    expect(deepTextId("sun-in-aries")).toBe(deepTextId("sun-in-aries"));
    expect(deepTextId("sun-in-aries")).not.toBe(deepTextId("moon-in-aries"));
    expect(compatReadingId(reading())).toBe(compatReadingId(reading({ answer: "You  two\nfit." })));
    expect(compatReadingId(reading())).not.toBe(compatReadingId(reading({ partnerName: "Sam" })));
  });

  it("matches a locally cleaned Oracle answer to the server's raw one", () => {
    expect(oracleEntryKey("Will I travel?", "Yes, in spring.\n[END_OF_REPORT]")).toBe(oracleEntryKey(" Will I  travel? ", "Yes, in spring."));
  });
});

describe("uploadLocalContent (REQ-007, DEC-004)", () => {
  it("rejects a deviceId-only caller and stores nothing", async () => {
    await expect(run(uploadLocalContent, { ...fullPayload(), ownerDeviceId: "d1" }, null)).rejects.toMatchObject({ code: "unauthenticated" });
    expect(items("deepTexts").size + items("compatibilityReadings").size + items("oracleHistory").size).toBe(0);
  });

  it("rejects a profile that is not claimed yet", async () => {
    await expect(run(uploadLocalContent, { ...fullPayload(), profileId: "p2" }, "u1")).rejects.toMatchObject({ code: "failed-precondition" });
    expect(items("deepTexts", "p2").size).toBe(0);
  });

  it("rejects a profile claimed by another account", async () => {
    await expect(run(uploadLocalContent, { ...fullPayload(), profileId: "p3" }, "u1")).rejects.toMatchObject({ code: "permission-denied" });
    expect(items("oracleHistory", "p3").size).toBe(0);
  });

  it("stores everything once for the owner and is idempotent", async () => {
    const first = await run(uploadLocalContent, fullPayload(), "u1");
    expect(first).toEqual({
      deepTexts: { added: 1, skipped: 0 },
      compatibilityReadings: { added: 1, skipped: 0 },
      oracleHistory: { added: 1, skipped: 0 },
    });
    const again = await run(uploadLocalContent, fullPayload(), "u1");
    expect(again.deepTexts.added + again.compatibilityReadings.added + again.oracleHistory.added).toBe(0);
    expect(items("deepTexts").size).toBe(1);
    expect(items("compatibilityReadings").size).toBe(1);
    expect(items("oracleHistory").size).toBe(1);
  });

  it("does not duplicate an Oracle entry the server already recorded under a random id", async () => {
    h.fake.seed("oracleHistory/p1/items", "random123", { ...oracle({ answer: "Yes, in spring.\n[END_OF_REPORT]" }), channel: "web" });
    const r = await run(uploadLocalContent, fullPayload(), "u1");
    expect(r.oracleHistory).toEqual({ added: 0, skipped: 1 });
    expect(items("oracleHistory").size).toBe(1);
  });

  it("never overwrites a deep text already on the server", async () => {
    h.fake.seed("deepTexts/p1/items", deepTextId("sun-in-aries"), { blockKey: "sun-in-aries", text: "Newer server text", language: "ru" });
    await run(uploadLocalContent, fullPayload(), "u1");
    expect([...items("deepTexts").values()][0].text).toBe("Newer server text");
  });

  it("never changes stars or unlock flags", async () => {
    const profileBefore = { ...h.fake.all("profiles").get("p1") };
    await run(uploadLocalContent, fullPayload(), "u1");
    expect(h.fake.all("wallets").get("u1")).toEqual({ tokens: 5 });
    expect(h.fake.all("profiles").get("p1")).toEqual(profileBefore);
    expect(h.fake.all("starSpends").size).toBe(0);
  });

  it("validates the payload and its limits", () => {
    expect(() => sanitizeUploadPayload({ deepTexts: "x" })).toThrow();
    expect(() => sanitizeUploadPayload({ oracleHistory: [{ question: "", answer: "a" }] })).toThrow();
    expect(() => sanitizeUploadPayload({ oracleHistory: Array.from({ length: 201 }, () => oracle()) })).toThrow();
    expect(() => sanitizeUploadPayload({ deepTexts: [{ blockKey: "k", text: "x".repeat(30_001) }] })).toThrow();
    expect(sanitizeUploadPayload({}).deepTexts).toEqual([]);
    expect(sanitizeUploadPayload({ oracleHistory: [oracle({ askedAt: "garbage" })] }).oracleHistory[0].askedAt).toMatch(/^\d{4}-/);
  });
});

describe("getProfileContent (REQ-005)", () => {
  beforeEach(async () => {
    await importLocalContent("p1", sanitizeUploadPayload(fullPayload()));
    h.fake.seed("oracleHistory/p1/items", "letter1", { ...oracle({ question: "From a letter", askedAt: "2026-10-03T10:00:00.000Z" }), channel: "letter" });
  });

  it("returns all three kinds to the owning account, newest Oracle entry first, letters included", async () => {
    const c = await run(getProfileContent, { profileId: "p1" }, "u1");
    expect(c.deepTexts["sun-in-aries"]).toEqual({ text: "Deep sun text", language: "ru" });
    expect(c.compatibilityReadings).toHaveLength(1);
    expect(c.compatibilityReadings[0].id).toBe(compatReadingId(reading()));
    expect(c.oracleHistory.map((e: { channel: string }) => e.channel)).toEqual(["letter", "web"]);
  });

  it("denies another account and the old device of a claimed profile", async () => {
    await expect(run(getProfileContent, { profileId: "p1" }, "u2")).rejects.toMatchObject({ code: "permission-denied" });
    await expect(run(getProfileContent, { profileId: "p1", ownerDeviceId: "d1" }, null)).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("lets an anonymous device read its unclaimed profile (empty)", async () => {
    const c = await run(getProfileContent, { profileId: "p2", ownerDeviceId: "d2" }, null);
    expect(c).toEqual({ deepTexts: {}, compatibilityReadings: [], oracleHistory: [] });
  });
});

describe("deletion (REQ-009, DEC-007, DEC-008)", () => {
  beforeEach(async () => {
    await importLocalContent("p1", sanitizeUploadPayload({
      ...fullPayload(),
      compatibilityReadings: [reading(), reading({ partnerName: "Sam" })],
    }));
  });

  it("deletes exactly one item for the owner", async () => {
    const id = compatReadingId(reading());
    expect(await run(deleteProfileContentItem, { profileId: "p1", kind: "compatibility", id }, "u1")).toEqual({ deleted: true });
    expect(items("compatibilityReadings").size).toBe(1);
    const oracleId = [...items("oracleHistory").keys()][0];
    await run(deleteProfileContentItem, { profileId: "p1", kind: "oracle", id: oracleId }, "u1");
    expect(items("oracleHistory").size).toBe(0);
  });

  it("refuses a non-owner and an id of another profile", async () => {
    const id = compatReadingId(reading());
    await expect(run(deleteProfileContentItem, { profileId: "p1", kind: "compatibility", id }, "u2")).rejects.toMatchObject({ code: "permission-denied" });
    h.fake.seed("profiles", "p4", { ownerUid: "u2" });
    expect(await run(deleteProfileContentItem, { profileId: "p4", kind: "compatibility", id }, "u2")).toEqual({ deleted: false });
    expect(items("compatibilityReadings").size).toBe(2);
  });

  it("deleteProfile removes every content item of the profile and nothing of others", async () => {
    await importLocalContent("p3", sanitizeUploadPayload(fullPayload()));
    await run(deleteProfile, { profileId: "p1" }, "u1");
    expect(h.fake.all("profiles").has("p1")).toBe(false);
    expect(items("deepTexts").size + items("compatibilityReadings").size + items("oracleHistory").size).toBe(0);
    expect(items("oracleHistory", "p3").size).toBe(1);
  });

  it("deleteProfile by a non-owner deletes nothing", async () => {
    await expect(run(deleteProfile, { profileId: "p1" }, "u2")).rejects.toMatchObject({ code: "permission-denied" });
    expect(items("compatibilityReadings").size).toBe(2);
    expect(h.fake.all("profiles").has("p1")).toBe(true);
  });

  it("deleteAllProfileContent reports what it removed", async () => {
    expect(await deleteAllProfileContent("p1")).toEqual({ deepTexts: 1, compatibilityReadings: 2, oracleHistory: 1 });
    expect(await readProfileContent("p1")).toEqual({ deepTexts: {}, compatibilityReadings: [], oracleHistory: [] });
  });
});

describe("firestore.rules (REQ-005)", () => {
  it("deny every direct client read and write", () => {
    const rules = readFileSync(resolve(__dirname, "../../../firestore.rules"), "utf-8");
    const allows = [...rules.matchAll(/allow\s+[^;]+;/g)].map((m) => m[0].replace(/\s+/g, " "));
    expect(allows).toEqual(["allow read, write: if false;"]);
    expect(rules).toContain("match /{document=**}");
  });
});
