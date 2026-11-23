import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createFakeFirestore, type FakeFirestore } from "./helpers/fakeFirestore";
import { loadAstroSeek, loadDatasets, referencePoints } from "./helpers/natalParity";

const h = vi.hoisted(() => ({
  fake: null as unknown as FakeFirestore,
  runTask: null as unknown as Mock,
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => h.fake.db,
  FieldValue: { serverTimestamp: () => "TS" },
}));
vi.mock("../services/ai/run", () => ({
  runTask: (...a: unknown[]) => h.runTask(...a),
  settingsKeyPart: () => ({}),
}));

import {
  MAX_OPEN_READINGS_PER_DAY,
  MAX_STORY_ATTEMPTS_PER_DAY,
  MAX_IMAGE_BASE64,
  describeChartReading,
  parseChartImage,
  readChartImage,
} from "../api/chartReading";
import { describeRecoveredBirth, normalizeChartReading, RESOLUTION } from "../services/chartReading";
import { AiRefusalError } from "../services/ai/providers/types";
import type { RecoveredBirth } from "../types";

const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A distinct PNG-looking picture per seed (the server only checks the signature and hashes the bytes). */
const picture = (seed: number) => Buffer.from([...PNG_SIGNATURE, seed, seed + 1, seed + 2]).toString("base64");

/** What a model returns for the Astro-Seek chart of dataset A (Cape Town, 30 Mar 2002, 03:30). */
function modelAnswerForDatasetA(): string {
  const toItem = (arcseconds: number) => {
    const minutes = Math.floor(arcseconds / 60);
    const sign = Math.floor(minutes / (30 * 60));
    const inSign = minutes - sign * 30 * 60;
    return { sign: SIGNS[sign], degree: Math.floor(inSign / 60), minute: inSign % 60, estimated: false };
  };
  const points = referencePoints(loadAstroSeek("A", "default-orbs"));
  const body = (p: (typeof points)[number]) => ({ id: p.id, retrograde: p.retrograde, ...toItem(p.shownArcseconds) });
  const asc = points.find((p) => p.id === "ASC");
  const mc = points.find((p) => p.id === "MC");
  return JSON.stringify({
    isNatalChart: true,
    zodiac: "tropical",
    points: points.filter((p) => p.id !== "ASC" && p.id !== "MC").map(body),
    asc: asc ? toItem(asc.shownArcseconds) : null,
    mc: mc ? toItem(mc.shownArcseconds) : null,
    notes: "",
  });
}

const answer = (text: string) => ({ text, model: "claude-sonnet-5-5", costUsd: 0.01, usage: {} });
type Callable = { run: (req: unknown) => Promise<any> };
const call = (fn: unknown, data: Record<string, unknown>, uid: string | null) =>
  (fn as Callable).run({ data, auth: uid ? { uid } : undefined, rawRequest: { headers: {} } });
const tokens = (key: string) => h.fake.all("wallets").get(key)?.tokens;
const readings = () => h.fake.all("chartReadings");
const today = () => new Date().toISOString().slice(0, 10);

beforeEach(() => {
  h.fake = createFakeFirestore();
  h.runTask = vi.fn().mockResolvedValue(answer(modelAnswerForDatasetA()));
  h.fake.seed("wallets", "u1", { tokens: 3 });
});

describe("normalizeChartReading", () => {
  it("accepts English, Russian, three-letter and glyph sign names and keeps minutes as minute bins", () => {
    const reading = normalizeChartReading({
      isNatalChart: true,
      zodiac: "tropical",
      points: [
        { id: "Sun", sign: "Aries", degree: 9, minute: 2 },
        { id: "Moon", sign: "Скорпион", degree: 4, minute: 59 },
        { id: "Mars", sign: "Gem", degree: 0, minute: 0 },
        { id: "Venus", sign: "♉", degree: 29, minute: null },
        { id: "Node", sign: "Gemini", degree: 1, minute: 3, retrograde: true },
      ],
      asc: { sign: "Aquarius", degree: 24, minute: 58 },
      mc: null,
      notes: "  Read from the table.  ",
    });
    expect(reading.points.map((p) => [p.id, p.sign, p.longitude])).toEqual([
      ["Sun", "Aries", 9 + 2 / 60],
      ["Moon", "Scorpio", 214 + 59 / 60],
      ["Mars", "Gemini", 60],
      ["Venus", "Taurus", 59],
      ["NorthNode", "Gemini", 61 + 3 / 60],
    ]);
    expect(reading.points[0].resolution).toBe(RESOLUTION.minute);
    expect(reading.points[3]).toMatchObject({ minute: null, resolution: RESOLUTION.degree });
    expect(reading.points[4].retrograde).toBe(true);
    expect(reading.asc).toMatchObject({ id: "ASC", longitude: 324 + 58 / 60 });
    expect(reading.mc).toBeNull();
    expect(reading.notes).toBe("Read from the table.");
  });

  it("drops out-of-range values, unknown points and repeats, and widens a position judged by eye", () => {
    const reading = normalizeChartReading({
      points: [
        { id: "Sun", sign: "Leo", degree: 30, minute: 0 },
        { id: "Sun", sign: "Leo", degree: 12, minute: 61 },
        { id: "Moon", sign: "Leo", degree: 12, minute: 5 },
        { id: "Moon", sign: "Virgo", degree: 1, minute: 0 },
        { id: "Vesta", sign: "Leo", degree: 3, minute: 0 },
        { id: "Pluto", sign: "Nowhere", degree: 3, minute: 0 },
        { id: "Saturn", sign: "Libra", degree: 7, minute: 30, estimated: true },
      ],
    });
    expect(reading.points.map((p) => p.id)).toEqual(["Moon", "Saturn"]);
    expect(reading.points[0].longitude).toBe(132 + 5 / 60);
    // "About 7° Libra" stands for 6°-9° Libra: the bin is centred on the degree.
    expect(reading.points[1]).toMatchObject({ minute: null, estimated: true, longitude: 186, resolution: RESOLUTION.estimated });
    expect(normalizeChartReading({ points: [{ id: "Sun", sign: "Aries", degree: 0, minute: null, estimated: true }] }).points[0].longitude).toBe(359);
  });

  it("is not a chart when the model says so or nothing was read", () => {
    expect(normalizeChartReading({ isNatalChart: false, points: [{ id: "Sun", sign: "Leo", degree: 1, minute: 0 }] }).isNatalChart).toBe(false);
    expect(normalizeChartReading({ isNatalChart: true, points: [] }).isNatalChart).toBe(false);
    expect(normalizeChartReading("nonsense").isNatalChart).toBe(false);
  });
});

describe("describeRecoveredBirth", () => {
  const birth: RecoveredBirth = {
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

  it("writes the date, time and place with their accuracy in the output language", () => {
    expect(describeRecoveredBirth(birth, "Cape Town, South Africa", "en")).toBe(
      "around 30 March 2002, at about 03:30 local time (± 1 min), near Cape Town, South Africa (within about 21 km)",
    );
    expect(describeRecoveredBirth(birth, null, "ru")).toBe(
      "примерно 30 марта 2002 г., около 03:30 по местному времени (± 1 мин), рядом с 33.9°S 18.3°E (в пределах ~21 км)",
    );
  });

  it("says what is unknown", () => {
    const dateOnly = { ...birth, birthTime: null, timezone: null, lat: null, lng: null, placeAccuracyKm: null };
    expect(describeRecoveredBirth(dateOnly, "ignored", "en")).toBe("around 30 March 2002, time of birth unknown, place of birth unknown");
  });
});

describe("parseChartImage", () => {
  it("accepts base64 or a data URL and trusts the bytes, not the claimed type", () => {
    const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.from([1, 2, 3, 4]), Buffer.from("WEBPVP8 ")]).toString("base64");
    expect(parseChartImage(`data:image/png;base64,${webp}`).image.mediaType).toBe("image/webp");
    expect(parseChartImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString("base64")).image.mediaType).toBe("image/jpeg");
    expect(parseChartImage(picture(1)).hash).toBe(parseChartImage(`data:image/png;base64,${picture(1)}`).hash);
    expect(parseChartImage(picture(1)).hash).not.toBe(parseChartImage(picture(2)).hash);
  });

  it("refuses other files, broken base64 and pictures that are too large", () => {
    expect(() => parseChartImage(Buffer.from("GIF89a....").toString("base64"))).toThrow("UNSUPPORTED_IMAGE");
    expect(() => parseChartImage("not base64!")).toThrow("image must be base64");
    expect(() => parseChartImage("A".repeat(MAX_IMAGE_BASE64 + 4))).toThrow("IMAGE_TOO_LARGE");
    expect(() => parseChartImage(undefined)).toThrow("image is required");
  });
});

describe("readChartImage", () => {
  const A = loadDatasets().find((d) => d.id === "A")!;

  it("needs an account and charges nothing before that", async () => {
    await expect(call(readChartImage, { image: picture(1) }, null)).rejects.toMatchObject({ code: "unauthenticated" });
    expect(h.runTask).not.toHaveBeenCalled();
    expect(h.fake.all("starSpends").size).toBe(0);
  });

  it("spends one star, recovers dataset A's birth and keeps the reading but never the picture", async () => {
    const image = picture(1);
    const result = await call(readChartImage, { image }, "u1");
    expect(tokens("u1")).toBe(2);
    expect(result.charged).toBe(true);
    expect(result.birth).toMatchObject({ status: "matched", birthDate: A.birthDate, timezone: A.timezone });
    const [hh, mm] = (result.birth.birthTime as string).split(":").map(Number);
    expect(Math.abs(hh * 60 + mm - (3 * 60 + 30))).toBeLessThanOrEqual(1);
    expect(result.birth.placeAccuracyKm).toBeLessThan(75);
    expect(result.chart.angles.ascendant).not.toBeNull();
    expect(result.reading.points.find((p: { id: string }) => p.id === "Sun")).toMatchObject({ matched: true });
    // The prompt carried the picture as the bytes' type.
    expect(h.runTask.mock.calls[0][1].images).toEqual([{ mediaType: "image/png", data: image }]);
    const stored = readings().get(result.readingId);
    expect(stored).toMatchObject({ uid: "u1", status: "ready" });
    expect(JSON.stringify(stored)).not.toContain(image);
    expect([...h.fake.all("starSpends").values()]).toEqual([expect.objectContaining({ walletKey: "u1", feature: "chart_reading", stars: 1 })]);
  });

  it("gives the same picture again for free", async () => {
    const first = await call(readChartImage, { image: picture(1) }, "u1");
    const again = await call(readChartImage, { image: `data:image/png;base64,${picture(1)}` }, "u1");
    expect(again).toMatchObject({ readingId: first.readingId, charged: false, birth: first.birth });
    expect(tokens("u1")).toBe(2);
    expect(h.runTask).toHaveBeenCalledTimes(1);
  });

  it("refunds when the picture is not a chart, and counts it against the daily limit", async () => {
    h.runTask.mockResolvedValueOnce(answer('{"isNatalChart":false,"points":[]}'));
    await expect(call(readChartImage, { image: picture(1) }, "u1")).rejects.toMatchObject({
      code: "failed-precondition",
      message: "CHART_NOT_READ",
      details: { reason: "not_a_chart" },
    });
    expect(tokens("u1")).toBe(3);
    expect([...readings().values()][0]).toMatchObject({ status: "failed", failureReason: "not_a_chart" });
    // The failed picture keeps its daily slot.
    expect(h.fake.all("chartReadingLimits").get("u1")).toEqual({ day: today(), open: 1 });
  });

  it("refunds when the positions belong to no moment, and when the answer is not JSON", async () => {
    const points = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"].map((id, i) => ({
      id,
      sign: SIGNS[(i * 5) % 12],
      degree: (i * 7) % 30,
      minute: 0,
    }));
    const angle = { sign: "Leo", degree: 3, minute: 0 };
    h.runTask.mockResolvedValueOnce(answer(JSON.stringify({ isNatalChart: true, zodiac: "tropical", points, asc: angle, mc: angle })));
    await expect(call(readChartImage, { image: picture(1) }, "u1")).rejects.toMatchObject({ details: { reason: "no_consistent_moment" } });
    h.runTask.mockResolvedValueOnce(answer("I cannot see a chart here."));
    await expect(call(readChartImage, { image: picture(2) }, "u1")).rejects.toMatchObject({ details: { reason: "unreadable" } });
    expect(tokens("u1")).toBe(3);
  });

  it("refuses, and refunds, a picture without ASC and MC or without the Moon: no place, no local time", async () => {
    const full = JSON.parse(modelAnswerForDatasetA());
    h.runTask.mockResolvedValueOnce(answer(JSON.stringify({ ...full, asc: null, mc: null })));
    await expect(call(readChartImage, { image: picture(1) }, "u1")).rejects.toMatchObject({ details: { reason: "missing_angles" } });
    h.runTask.mockResolvedValueOnce(answer(JSON.stringify({ ...full, mc: null })));
    await expect(call(readChartImage, { image: picture(2) }, "u1")).rejects.toMatchObject({ details: { reason: "missing_angles" } });
    const noMoon = full.points.filter((p: { id: string }) => p.id !== "Moon");
    h.runTask.mockResolvedValueOnce(answer(JSON.stringify({ ...full, points: noMoon })));
    await expect(call(readChartImage, { image: picture(3) }, "u1")).rejects.toMatchObject({ details: { reason: "missing_moon" } });
    expect(tokens("u1")).toBe(3);
  });

  it("refuses a sidereal chart instead of solving it as tropical", async () => {
    const tropical = JSON.parse(modelAnswerForDatasetA());
    h.runTask.mockResolvedValueOnce(answer(JSON.stringify({ ...tropical, zodiac: "sidereal" })));
    await expect(call(readChartImage, { image: picture(1) }, "u1")).rejects.toMatchObject({ details: { reason: "sidereal" } });
    expect(tokens("u1")).toBe(3);
  });

  it("refunds when the AI call fails, without counting it against the user", async () => {
    h.runTask.mockRejectedValueOnce(new Error("provider down"));
    await expect(call(readChartImage, { image: picture(1) }, "u1")).rejects.toMatchObject({ code: "internal", message: "CHART_READING_FAILED" });
    expect(tokens("u1")).toBe(3);
    expect(h.fake.all("chartReadingLimits").get("u1")).toEqual({ day: today(), open: 0 });
    // The failed picture can be tried again (and is charged again).
    await call(readChartImage, { image: picture(1) }, "u1");
    expect(tokens("u1")).toBe(2);
  });

  it("charges nothing and calls no model without a star, after too many failed pictures, or while the same picture is being read", async () => {
    h.fake.seed("wallets", "u2", { tokens: 0 });
    await expect(call(readChartImage, { image: picture(1) }, "u2")).rejects.toMatchObject({ message: "INSUFFICIENT_TOKENS" });

    h.fake.seed("chartReadingLimits", "u1", { day: today(), open: MAX_OPEN_READINGS_PER_DAY });
    await expect(call(readChartImage, { image: picture(1) }, "u1")).rejects.toMatchObject({
      code: "resource-exhausted",
      message: "TOO_MANY_FAILED_READINGS",
    });
    h.fake.seed("chartReadingLimits", "u1", { day: "2000-01-01", open: 99 });

    const { hash } = parseChartImage(picture(3));
    h.fake.seed("chartReadings", `u1_${hash}`, { uid: "u1", status: "pending", startedAtMs: Date.now() });
    await expect(call(readChartImage, { image: picture(3) }, "u1")).rejects.toMatchObject({ code: "aborted", message: "READING_IN_PROGRESS" });

    expect(tokens("u1")).toBe(3);
    expect(h.runTask).not.toHaveBeenCalled();
  });

  it("takes over the unrefunded star of a dead attempt on the same picture instead of charging again", async () => {
    const { hash } = parseChartImage(picture(1));
    h.fake.seed("chartReadings", `u1_${hash}`, {
      uid: "u1",
      status: "pending",
      attemptId: "dead",
      charged: true,
      startedAtMs: Date.now() - 7 * 60_000,
    });
    const result = await call(readChartImage, { image: picture(1) }, "u1");
    expect(result.charged).toBe(true);
    expect(tokens("u1")).toBe(3);
    expect(h.fake.all("starSpends").size).toBe(0);
    expect(readings().get(`u1_${hash}`)).toMatchObject({ status: "ready", charged: false });
  });

  it("does not let an attempt that lost the reading store its result, refund or release the slot", async () => {
    const { hash } = parseChartImage(picture(1));
    const id = `u1_${hash}`;
    const takeOver = () => h.fake.seed("chartReadings", id, { ...readings().get(id), attemptId: "newer" });
    h.runTask.mockImplementationOnce(async () => {
      takeOver();
      return answer(modelAnswerForDatasetA());
    });
    await expect(call(readChartImage, { image: picture(1) }, "u1")).rejects.toMatchObject({ code: "aborted" });
    expect(readings().get(id)).toMatchObject({ status: "pending", attemptId: "newer", charged: true });

    h.fake.seed("chartReadings", id, { uid: "u1", status: "failed", startedAtMs: 0 });
    h.runTask.mockImplementationOnce(async () => {
      takeOver();
      throw new Error("provider down");
    });
    await expect(call(readChartImage, { image: picture(1) }, "u1")).rejects.toMatchObject({ code: "internal" });
    // Two stars spent, none refunded: the newer attempt holds the second one.
    expect(tokens("u1")).toBe(1);
    expect(readings().get(id)).toMatchObject({ status: "pending", attemptId: "newer" });
  });

  it("refunds a picture the model refuses, and counts it against the user", async () => {
    h.runTask.mockRejectedValueOnce(new AiRefusalError("Claude", "refusal"));
    await expect(call(readChartImage, { image: picture(1) }, "u1")).rejects.toMatchObject({ code: "internal" });
    expect(tokens("u1")).toBe(3);
    expect([...readings().values()][0]).toMatchObject({ status: "failed", failureReason: "refused" });
    expect(h.fake.all("chartReadingLimits").get("u1")).toEqual({ day: today(), open: 1 });
  });

  it("frees the daily slot when a reading succeeds, so only failed pictures add up", async () => {
    await call(readChartImage, { image: picture(1) }, "u1");
    await call(readChartImage, { image: picture(2) }, "u1");
    expect(h.fake.all("chartReadingLimits").get("u1")).toEqual({ day: today(), open: 0 });
  });

  it("sends the model the canonical base64 of the checked bytes", async () => {
    const bytes = Buffer.from([...PNG_SIGNATURE, 7, 8, 9]);
    const unpadded = bytes.toString("base64").replace(/=+$/, "");
    expect(parseChartImage(unpadded).image.data).toBe(bytes.toString("base64"));
  });
});

describe("describeChartReading", () => {
  async function readOne() {
    return (await call(readChartImage, { image: picture(1) }, "u1")).readingId as string;
  }

  it("writes the story once per language for the owner only", async () => {
    const readingId = await readOne();
    h.runTask.mockResolvedValue(answer("## Born around\nA story."));
    const en = await call(describeChartReading, { readingId, language: "en", placeName: "Cape Town" }, "u1");
    expect(en).toEqual({ readingId, language: "en", text: "## Born around\nA story." });
    expect(h.runTask.mock.calls[1][1].userPrompt).toContain("near Cape Town");
    await call(describeChartReading, { readingId, language: "en" }, "u1");
    expect(h.runTask).toHaveBeenCalledTimes(2);
    await call(describeChartReading, { readingId, language: "ru" }, "u1");
    expect(h.runTask).toHaveBeenCalledTimes(3);
    expect(readings().get(readingId)?.stories).toEqual({ en: "## Born around\nA story.", ru: "## Born around\nA story." });
    expect(tokens("u1")).toBe(2);

    await expect(call(describeChartReading, { readingId, language: "en" }, "u2")).rejects.toMatchObject({ code: "not-found" });
    await expect(call(describeChartReading, { readingId: `u1_${"0".repeat(64)}`, language: "en" }, "u1")).rejects.toMatchObject({ code: "not-found" });
    await expect(call(describeChartReading, { readingId: "a/b", language: "en" }, "u1")).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(call(describeChartReading, { readingId, language: "en" }, null)).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("lets a failed story be tried again a limited number of times a day, per language", async () => {
    const readingId = await readOne();
    h.runTask.mockRejectedValue(new Error("provider down"));
    for (let attempt = 0; attempt < MAX_STORY_ATTEMPTS_PER_DAY; attempt += 1) {
      await expect(call(describeChartReading, { readingId, language: "en" }, "u1")).rejects.toMatchObject({ message: "STORY_FAILED" });
    }
    await expect(call(describeChartReading, { readingId, language: "en" }, "u1")).rejects.toMatchObject({
      code: "resource-exhausted",
    });
    // Another day, or the other language, can still be tried.
    const doc = readings().get(readingId) as { storyAttempts: Record<string, unknown> };
    h.fake.seed("chartReadings", readingId, { ...doc, storyAttempts: { ...doc.storyAttempts, en: { day: "2000-01-01", count: 99 } } });
    h.runTask.mockResolvedValue(answer("A story."));
    await expect(call(describeChartReading, { readingId, language: "en" }, "u1")).resolves.toMatchObject({ text: "A story." });
  });

  it("keeps the other language's lock while one story finishes", async () => {
    const readingId = await readOne();
    const doc = readings().get(readingId) as Record<string, unknown>;
    const ruStarted = Date.now();
    h.fake.seed("chartReadings", readingId, { ...doc, storyStartedAtMs: { ru: ruStarted } });
    h.runTask.mockResolvedValue(answer("An English story."));
    await call(describeChartReading, { readingId, language: "en" }, "u1");
    expect(readings().get(readingId)?.storyStartedAtMs).toEqual({ ru: ruStarted, en: 0 });
    await expect(call(describeChartReading, { readingId, language: "ru" }, "u1")).rejects.toMatchObject({ message: "STORY_IN_PROGRESS" });
  });
});
