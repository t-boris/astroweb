import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createFakeFirestore, type FakeFirestore } from "./helpers/fakeFirestore";

const h = vi.hoisted(() => ({ fake: null as unknown as FakeFirestore, runTask: null as unknown as Mock }));

vi.mock("firebase-admin/firestore", () => ({ getFirestore: () => h.fake.db }));
vi.mock("../services/ai/run", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/ai/run")>()),
  runTask: (...a: unknown[]) => h.runTask(...a),
}));

import { buildNewsDigest } from "../services/newsDigest";
import { clearTaskSettingsCache } from "../services/ai/settings";

const params = { interestTags: ["music"], residence: "Berlin", language: "en" as const, date: "2026-10-18" };

beforeEach(() => {
  h.fake = createFakeFirestore();
  clearTaskSettingsCache();
  h.runTask = vi.fn().mockResolvedValue({
    text: '{"hooks":[{"headline":"H","oneLine":"O"}],"note":"n"}',
    model: "claude-sonnet-4-6",
    provider: "anthropic",
    usage: { inputTokens: 10, outputTokens: 5, webSearches: 1 },
    costUsd: 0.02,
  });
});

describe("news digest cache (DEC-004, REQ-007, REQ-009)", () => {
  it("caches a letter's digest under the unchanged key on default settings", async () => {
    const digest = await buildNewsDigest(params);
    expect(digest).toEqual({ hooks: [{ headline: "H", oneLine: "O" }], note: "n", costUsd: 0.02 });
    expect([...h.fake.all("newsCache").keys()]).toEqual(["2026-10-18__Berlin__music"]);
  });

  it("never writes the cache in an admin test run, but still reads it", async () => {
    await buildNewsDigest(params, { cache: "read" });
    expect(h.fake.all("newsCache").size).toBe(0);
    h.fake.seed("newsCache", "2026-10-18__Berlin__music", { hooks: [], note: "cached" });
    expect(await buildNewsDigest(params, { cache: "read" })).toMatchObject({ note: "cached", costUsd: 0 });
    expect(h.runTask).toHaveBeenCalledTimes(1);
  });

  it("uses a new key when the task runs on custom settings", async () => {
    h.fake.seed("aiSettings", "newsDigest", { maxOutputTokens: 1500 });
    await buildNewsDigest(params);
    const [key] = [...h.fake.all("newsCache").keys()];
    expect(key).toMatch(/^2026-10-18__Berlin__music__[0-9a-f]{16}$/);
  });
});
