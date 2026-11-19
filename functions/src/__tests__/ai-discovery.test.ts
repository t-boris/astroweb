import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createFakeFirestore, type FakeFirestore } from "./helpers/fakeFirestore";
import { GEMINI_TEST_KEY } from "./helpers/aiKeys";

const h = vi.hoisted(() => ({ fake: null as unknown as FakeFirestore }));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => h.fake.db,
}));

import {
  clearDiscoveredModels,
  costUsd,
  findModel,
  priceOn,
} from "../services/ai/models";
import { buildAnthropicBody } from "../services/ai/providers/anthropic";
import {
  clearDiscoveredModelsCache,
  discoverLiveModels,
  loadPersistedDiscoveredModels,
  persistDiscoveredModel,
} from "../services/ai/discovery";
import { clearTaskSettingsCache, loadTaskSettings, saveTaskOverride, validateOverride } from "../services/ai/settings";

let fetchMock: Mock;

beforeEach(() => {
  h.fake = createFakeFirestore();
  clearTaskSettingsCache();
  clearDiscoveredModels();
  clearDiscoveredModelsCache();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  process.env.ANTHROPIC_API_KEY = "sk-ant-api03-abcdefghijklmnop";
  process.env.OPENAI_API_KEY = "sk-proj-abcdefghijklmnopqrstuvwxyz";
  process.env.GEMINI_API_KEY = GEMINI_TEST_KEY;
});

describe("Curated AI models catalog (2026-11-19)", () => {
  it("includes Claude Fable 5.2, GPT-6.2 Astra/Sol, GPT-6.1 Terra, and Gemini 4 Carbon/Neon/Hydrogen with verified rules", () => {
    const fable = findModel("claude-fable-5-2")!;
    expect(fable).toMatchObject({
      provider: "anthropic",
      label: "Claude Fable 5.2",
      temperature: false,
      thinking: "always",
      effort: "low",
      refusalFallback: true,
      webSearch: true,
    });
    expect(priceOn(fable, new Date("2026-11-19"))).toMatchObject({ inputPerMTok: 8, outputPerMTok: 40 });
    expect(buildAnthropicBody({ model: fable, system: "S", user: "U", maxOutputTokens: 1000 })).toMatchObject({
      model: "claude-fable-5-2",
      output_config: { effort: "low" },
      fallbacks: "default",
    });

    expect(findModel("gpt-6.2-astra")).toMatchObject({ provider: "openai", thinking: "always", temperature: false });
    expect(priceOn(findModel("gpt-6.2-astra")!, new Date("2026-11-19"))).toMatchObject({ inputPerMTok: 8, outputPerMTok: 40 });
    expect(priceOn(findModel("gpt-6.2-sol")!, new Date("2026-11-19"))).toMatchObject({ inputPerMTok: 2, outputPerMTok: 10 });
    expect(priceOn(findModel("gpt-6.1-terra")!, new Date("2026-11-19"))).toMatchObject({ inputPerMTok: 1, outputPerMTok: 5 });

    const carbon = findModel("gemini-4-carbon")!;
    expect(priceOn(carbon, new Date("2026-11-19"))).toMatchObject({ inputPerMTok: 2, outputPerMTok: 10 });
    expect(priceOn(carbon, new Date("2026-12-01"))).toMatchObject({ inputPerMTok: 4, outputPerMTok: 20 });
    expect(priceOn(findModel("gemini-4-neon")!, new Date("2026-11-19"))).toMatchObject({ inputPerMTok: 3, outputPerMTok: 15 });
    expect(priceOn(findModel("gemini-4-hydrogen")!, new Date("2026-11-19"))).toMatchObject({ inputPerMTok: 1.5, outputPerMTok: 7.5 });
  });
});

describe("Automatic live model discovery across Anthropic, OpenAI, and Gemini", () => {
  it("discovers newly released models after catalog cutoff, filters legacy/non-text models, and persists saved selections", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith("https://api.anthropic.com/v1/models")) {
        return {
          ok: true,
          json: async () => ({
            data: [
              { id: "claude-opus-6", display_name: "Claude Opus 6", created_at: "2026-12-10T00:00:00Z" },
              { id: "claude-fable-5-2", display_name: "Claude Fable 5.2", created_at: "2026-11-09T18:30:00Z" },
              { id: "claude-fable-5-1", display_name: "Claude Fable 5.1", created_at: "2026-08-28T00:00:00Z" },
              { id: "claude-opus-4-5-20251101", display_name: "Claude Opus 4.5", created_at: "2025-11-24T00:00:00Z" },
            ],
          }),
        };
      }
      if (url.startsWith("https://api.openai.com/v1/models")) {
        return {
          ok: true,
          json: async () => ({
            data: [
              { id: "gpt-6.3-astra", created: Math.floor(Date.parse("2026-12-15T00:00:00Z") / 1000) },
              { id: "gpt-6.3-astra-audio-preview", created: Math.floor(Date.parse("2026-12-15T00:00:00Z") / 1000) },
              { id: "gpt-6.3-astra-2026-12-15", created: Math.floor(Date.parse("2026-12-15T00:00:00Z") / 1000) },
              { id: "gpt-4o", created: 1715000000 },
            ],
          }),
        };
      }
      if (url.startsWith("https://generativelanguage.googleapis.com/v1beta/models")) {
        return {
          ok: true,
          json: async () => ({
            models: [
              { name: "models/gemini-4.5-pro", displayName: "Gemini 4.5 Pro", supportedGenerationMethods: ["generateContent"] },
              { name: "models/gemini-4.5-embedding", displayName: "Embedding", supportedGenerationMethods: ["embedContent"] },
              { name: "models/gemini-4-carbon", displayName: "Gemini 4 Carbon", supportedGenerationMethods: ["generateContent"] },
            ],
          }),
        };
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const found = await discoverLiveModels();
    expect(found.map((m) => m.id).sort()).toEqual(["claude-opus-6", "gemini-4.5-pro", "gpt-6.3-astra"]);

    // Live-discovered models validate, have safe reasoning defaults, and zero-safe costUsd
    const opus6 = findModel("claude-opus-6")!;
    expect(opus6).toMatchObject({
      provider: "anthropic",
      label: "Claude Opus 6",
      live: true,
      temperature: false,
      thinking: "always",
      effort: "low",
      refusalFallback: true,
    });
    expect(priceOn(opus6)).toBeNull();
    expect(costUsd(opus6, { inputTokens: 1000, outputTokens: 500, webSearches: 1 })).toBeCloseTo(0.01, 6);
    expect(validateOverride("oracle", { model: "claude-opus-6" }, { requireProviderKey: true })).toEqual([]);

    // Arbitrary bogus model IDs remain strictly rejected
    expect(validateOverride("oracle", { model: "claude-totally-bogus" }, { requireProviderKey: true })).toEqual([
      'Unknown model "claude-totally-bogus"',
    ]);

    // Persist discovered model and simulate a fresh Cloud Function cold start reading it via loadTaskSettings
    await persistDiscoveredModel(opus6);
    await saveTaskOverride("oracle", { model: "claude-opus-6" }, "t.boris@gmail.com");

    clearTaskSettingsCache();
    clearDiscoveredModels();
    clearDiscoveredModelsCache();
    expect(findModel("claude-opus-6")).toBeUndefined();

    const loaded = await loadTaskSettings("oracle");
    expect(loaded.model).toBe("claude-opus-6");
    expect(findModel("claude-opus-6")).toMatchObject({ id: "claude-opus-6", live: true });

    // Re-calling loadPersistedDiscoveredModels returns cleanly without crashing
    await expect(loadPersistedDiscoveredModels(true)).resolves.toHaveLength(1);
  });

  it("fails open when a provider models endpoint returns an error or network failure", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(discoverLiveModels()).resolves.toEqual([]);
  });
});
