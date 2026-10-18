import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createFakeFirestore, type FakeFirestore } from "./helpers/fakeFirestore";

const h = vi.hoisted(() => ({ fake: null as unknown as FakeFirestore, runTask: null as unknown as Mock }));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => h.fake.db,
  FieldValue: { serverTimestamp: () => "TS" },
}));
vi.mock("../services/chartResolver", () => ({
  resolveOwnedChart: async (p: { profileId: string }) => {
    const snap = await (h.fake.db as any).collection("profiles").doc(p.profileId).get();
    return {
      profile: { id: p.profileId, ...snap.data() },
      chart: {
        meta: { houseSystem: "koch", zodiac: "tropical", timeUsed: "12:00", timezoneUsed: "UTC" },
        points: [{ body: "Sun", lon: 10, sign: "Aries", degreeInSign: 10, house: 1 }],
        houses: { system: "koch", cusps: [], asc: null, mc: null },
        aspects: [],
      },
    };
  },
}));
vi.mock("../astro/chart", () => ({
  computeNatalChart: (input: { lat: number }) => {
    if (input.lat === 999) throw new Error("chart computation failed");
    return {
      meta: { houseSystem: "koch", zodiac: "tropical", timeUsed: "12:00", timezoneUsed: "UTC" },
      points: [{ body: "Sun", lon: 10, sign: "Aries", degreeInSign: 10, house: 1 }],
      houses: { system: "koch", cusps: [], asc: null, mc: null },
      aspects: [],
    };
  },
}));
vi.mock("../services/ai/run", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/ai/run")>()),
  runTask: (...a: unknown[]) => h.runTask(...a),
}));

import { adminGetAiSettings, adminResetAiSettings, adminSaveAiSettings, adminTestAiTask } from "../api/adminAi";
import { clearTaskSettingsCache } from "../services/ai/settings";

type Callable = { run: (req: unknown) => Promise<any> };
const call = (fn: unknown, auth: unknown, data: Record<string, unknown> = {}) => (fn as Callable).run({ auth, data });
const admin = { uid: "admin", token: { email: "t.boris@gmail.com", email_verified: true } };
const outsiders = [
  ["signed out", undefined],
  ["a non-admin user", { uid: "x", token: { email: "someone@example.com", email_verified: true } }],
  ["the admin address unverified", { uid: "x", token: { email: "t.boris@gmail.com", email_verified: false } }],
] as const;

beforeEach(() => {
  h.fake = createFakeFirestore();
  h.runTask = vi.fn().mockResolvedValue({
    text: "Test answer",
    model: "claude-opus-4-8",
    provider: "anthropic",
    usage: { inputTokens: 100, outputTokens: 50, webSearches: 0 },
    costUsd: 0.00175,
  });
  clearTaskSettingsCache();
  process.env.ANTHROPIC_API_KEY = "sk-ant-api03-abcdefghijklmnop";
  process.env.OPENAI_API_KEY = "unset";
  process.env.GEMINI_API_KEY = "unset";
  h.fake.seed("profiles", "p1", { ownerUid: "u1", ownerDeviceId: "d1", name: "Anna", birthDate: "1990-01-01", lat: 1, lng: 2, timezone: "UTC", birthPlace: "X" });
  h.fake.seed("profiles", "p2", { ownerUid: "u2", ownerDeviceId: "d2", name: "Max", birthDate: "1991-01-01", lat: 1, lng: 2, timezone: "UTC", birthPlace: "Y" });
  h.fake.seed("wallets", "u1", { tokens: 5 });
});

describe("admin AI callables are admin-only (REQ-005)", () => {
  const callables = [
    ["adminGetAiSettings", adminGetAiSettings, {}],
    ["adminSaveAiSettings", adminSaveAiSettings, { taskId: "oracle", override: {} }],
    ["adminResetAiSettings", adminResetAiSettings, { taskId: "oracle" }],
    ["adminTestAiTask", adminTestAiTask, { taskId: "oracle", override: {}, profileId: "p1", inputs: { question: "Q?" } }],
  ] as const;
  for (const [name, fn, data] of callables) {
    for (const [who, auth] of outsiders) {
      it(`${name} rejects ${who}`, async () => {
        await expect(call(fn, auth, data)).rejects.toMatchObject({ code: "permission-denied" });
      });
    }
  }
});

describe("adminGetAiSettings (REQ-001)", () => {
  it("lists every task with its effective settings, the models and which providers are configured", async () => {
    h.fake.seed("aiSettings", "forecast", { maxOutputTokens: 1500, updatedBy: "t.boris@gmail.com", updatedAt: "2026-10-18T10:00:00Z" });
    const res = await call(adminGetAiSettings, admin);
    expect(res.providers).toEqual({ anthropic: true, openai: false, gemini: false });
    expect(res.tasks.map((t: { id: string }) => t.id)).toEqual([
      "oracle",
      "oracleLetter",
      "compatibility",
      "deepen",
      "forecast",
      "premiumPdf",
      "letterAnalysis",
      "letterWriting",
      "newsDigest",
      "factExtraction",
    ]);
    const oracle = res.tasks[0];
    expect(oracle.effective).toMatchObject({ model: "claude-opus-4-8", maxOutputTokens: 2400, temperature: null, version: "" });
    expect(oracle.override).toEqual({});
    const forecast = res.tasks[4];
    expect(forecast.override).toEqual({ maxOutputTokens: 1500 });
    expect(forecast.updatedBy).toBe("t.boris@gmail.com");
    const gpt = res.models.find((m: { id: string }) => m.id === "gpt-6-astra");
    expect(gpt).toMatchObject({ provider: "openai", available: false, temperature: false });
    expect(JSON.stringify(res)).not.toContain("sk-ant-");
  });
});

describe("adminSaveAiSettings and adminResetAiSettings (REQ-002..004)", () => {
  it("refuses invalid settings with the problems listed and stores nothing", async () => {
    await expect(
      call(adminSaveAiSettings, admin, { taskId: "oracle", override: { texts: { en: { user: "{{question}} only" } } } }),
    ).rejects.toMatchObject({ code: "invalid-argument", details: { problems: ["User message (EN) is missing {{chart}}"] } });
    await expect(call(adminSaveAiSettings, admin, { taskId: "oracle", override: { model: "gemini-4-argon" } })).rejects.toMatchObject({
      code: "invalid-argument",
    });
    await expect(call(adminSaveAiSettings, admin, { taskId: "nope", override: {} })).rejects.toMatchObject({ code: "invalid-argument" });
    expect(h.fake.all("aiSettings").size).toBe(0);
  });

  it("saves a valid override with who saved it, and resets it", async () => {
    const saved = await call(adminSaveAiSettings, admin, {
      taskId: "deepen",
      override: { model: "claude-haiku-4-5", maxOutputTokens: 3000, temperature: 0.2 },
    });
    expect(saved.task.effective).toMatchObject({ model: "claude-haiku-4-5", maxOutputTokens: 3000, temperature: 0.2 });
    expect(saved.task.effective.version).not.toBe("");
    expect(h.fake.all("aiSettings").get("deepen")).toMatchObject({ model: "claude-haiku-4-5", updatedBy: "t.boris@gmail.com" });

    const reset = await call(adminResetAiSettings, admin, { taskId: "deepen" });
    expect(reset.task.effective).toMatchObject({ model: "claude-sonnet-4-6", version: "" });
    expect(h.fake.all("aiSettings").has("deepen")).toBe(false);
  });
});

describe("adminTestAiTask (REQ-009)", () => {
  const snapshotStore = () =>
    JSON.stringify(
      ["aiSettings", "wallets", "oracleHistory/p1/items", "deepInterpretationCache", "forecastCache", "dossiers", "profiles", "charts", "newsCache"].map((c) => [
        c,
        [...h.fake.all(c).entries()],
      ]),
    );

  it("runs the unsaved settings on a profile and writes or charges nothing", async () => {
    const before = snapshotStore();
    const res = await call(adminTestAiTask, admin, {
      taskId: "oracle",
      profileId: "p1",
      language: "en",
      override: { maxOutputTokens: 1800, texts: { en: { user: "Q: {{question}}\nChart: {{chart}}" } } },
      inputs: { question: "Will it rain?" },
    });
    expect(res).toMatchObject({ text: "Test answer", model: "claude-opus-4-8", costUsd: 0.00175 });
    expect(res.prompt.user).toBe("Q: Will it rain?\nChart: " + res.prompt.user.split("Chart: ")[1]);
    const [settings] = h.runTask.mock.calls[0];
    expect(settings).toMatchObject({ taskId: "oracle", maxOutputTokens: 1800 });
    expect(snapshotStore()).toBe(before);
  });

  it("tests the news digest without creating a dossier for the profile", async () => {
    const res = await call(adminTestAiTask, admin, { taskId: "newsDigest", profileId: "p1", override: {}, inputs: {} });
    expect(res.prompt.user).toMatch(/^Interests: general\. Region: X\. Date: \d{4}-\d{2}-\d{2}\.$/);
    expect(h.fake.all("dossiers").size).toBe(0);
  });

  it("asks for the inputs a task needs", async () => {
    await expect(call(adminTestAiTask, admin, { taskId: "oracle", profileId: "p1", override: {}, inputs: {} })).rejects.toMatchObject({
      code: "invalid-argument",
    });
    await expect(call(adminTestAiTask, admin, { taskId: "premiumPdf", profileId: "p1", override: {}, inputs: { section: "x" } })).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("builds a compatibility test from two profiles", async () => {
    const res = await call(adminTestAiTask, admin, {
      taskId: "compatibility",
      profileId: "p1",
      language: "ru",
      override: {},
      inputs: { partnerProfileId: "p2" },
    });
    expect(res.prompt.user).toContain("Сделай расклад на отношения для пары: Anna и Max.");
  });

  it("reports a failure while preparing the prompt with its reason", async () => {
    h.fake.seed("profiles", "broken", { ownerUid: "u3", ownerDeviceId: "d3", name: "B", birthDate: "1990-01-01", lat: 999, lng: 2, timezone: "UTC" });
    await expect(call(adminTestAiTask, admin, { taskId: "forecast", profileId: "broken", override: {}, inputs: {} })).rejects.toMatchObject({
      code: "internal",
      message: "Could not prepare the test: chart computation failed",
    });
    expect(h.runTask).not.toHaveBeenCalled();
  });

  it("reports a failed generation as an error with the prompt that was sent", async () => {
    h.runTask.mockRejectedValueOnce(new Error("Claude refused the request: cyber"));
    await expect(
      call(adminTestAiTask, admin, { taskId: "forecast", profileId: "p1", override: {}, inputs: {} }),
    ).rejects.toMatchObject({ code: "internal", message: "Claude refused the request: cyber" });
  });
});
