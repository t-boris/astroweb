import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeFirestore, type FakeFirestore } from "./helpers/fakeFirestore";

const h = vi.hoisted(() => ({ fake: null as unknown as FakeFirestore, failReads: false }));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => {
    if (h.failReads) throw new Error("firestore unavailable");
    return h.fake.db;
  },
}));

import { checkTemplate, fillTemplate, placeholdersIn } from "../services/ai/template";
import { AI_MODELS, costUsd, findModel, priceOn, requestOutputTokens, THINKING_HEADROOM_TOKENS } from "../services/ai/models";
import { apiKeyFor, providerConfigured } from "../services/ai/keys";
import { AI_TASKS, taskSpec, type AiTaskId } from "../services/ai/tasks";
import {
  clearTaskSettingsCache,
  defaultTaskSettings,
  loadTaskSettings,
  mergeTaskSettings,
  minimalOverride,
  resetTaskOverride,
  saveTaskOverride,
  textsFor,
  validateOverride,
} from "../services/ai/settings";
import { settingsKeyPart } from "../services/ai/run";
import { computePremiumPdfCacheKey } from "../services/premiumPdf";
import { createHash } from "node:crypto";
import type { Profile } from "../types";

const KEYS = { ANTHROPIC_API_KEY: "sk-ant-api03-abcdefghijklmnop", OPENAI_API_KEY: "unset", GEMINI_API_KEY: "unset" };

beforeEach(() => {
  h.fake = createFakeFirestore();
  h.failReads = false;
  clearTaskSettingsCache();
  Object.assign(process.env, KEYS);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("templates", () => {
  it("fills placeholders in one pass, so inserted text is never read as a placeholder", () => {
    expect(fillTemplate("Q: {{question}} / {{ chart }}", { question: "is {{chart}} here?", chart: "C" })).toBe(
      "Q: is {{chart}} here? / C",
    );
  });

  it("removes an empty optional block together with the blank lines above it", () => {
    const template = "Intro.\n\n{{personalBlock}}";
    expect(fillTemplate(template, { personalBlock: "" }, new Set(["personalBlock"]))).toBe("Intro.");
    expect(fillTemplate(template, { personalBlock: "Facts" }, new Set(["personalBlock"]))).toBe("Intro.\n\nFacts");
  });

  it("keeps the line of an empty placeholder that is not an optional block", () => {
    expect(fillTemplate("A\n{{x}}\nB", { x: "" })).toBe("A\n\nB");
  });

  it("lists placeholders and reports missing and unknown ones", () => {
    expect(placeholdersIn("{{a}} {{b}} {{a}} {\"json\": {\"x\": 1}}")).toEqual(["a", "b"]);
    expect(checkTemplate("{{a}} {{zzz}}", ["a", "b"], ["a", "b"])).toEqual({ missing: ["b"], unknown: ["zzz"] });
  });
});

describe("model list (DEC-002)", () => {
  it("covers the three providers with unique ids and ascending prices", () => {
    expect(new Set(AI_MODELS.map((m) => m.provider))).toEqual(new Set(["anthropic", "openai", "gemini"]));
    expect(new Set(AI_MODELS.map((m) => m.id)).size).toBe(AI_MODELS.length);
    for (const model of AI_MODELS) {
      const dates = model.prices.map((p) => p.from);
      expect([...dates].sort()).toEqual(dates);
    }
  });

  it("applies announced price changes from their date", () => {
    const argon = findModel("gemini-4-argon")!;
    expect(priceOn(argon, new Date("2026-11-30T12:00:00Z")).inputPerMTok).toBe(2);
    expect(priceOn(argon, new Date("2026-12-01T00:00:00Z")).inputPerMTok).toBe(4);
  });

  it("computes cost from tokens and web searches", () => {
    const sonnet = findModel("claude-sonnet-4-6")!;
    expect(costUsd(sonnet, { inputTokens: 1_000_000, outputTokens: 100_000, webSearches: 2 })).toBeCloseTo(3 + 1.5 + 0.02);
  });

  it("adds reasoning headroom only for models whose reasoning counts against the limit", () => {
    expect(requestOutputTokens(findModel("claude-opus-4-8")!, 2400)).toBe(2400);
    expect(requestOutputTokens(findModel("gpt-6-astra")!, 2400)).toBe(2400 + THINKING_HEADROOM_TOKENS);
  });
});

describe("provider keys (DEC-019)", () => {
  it("treats the placeholder as not configured", () => {
    expect(providerConfigured("anthropic")).toBe(true);
    expect(providerConfigured("openai")).toBe(false);
    expect(apiKeyFor("gemini")).toBeNull();
    process.env.OPENAI_API_KEY = "sk-proj-abcdefghijklmnopqrstuvwxyz";
    process.env.GEMINI_API_KEY = "AIzaSyAbcdefghijklmnopqrstuvwxyz0123456";
    expect(providerConfigured("openai")).toBe(true);
    expect(providerConfigured("gemini")).toBe(true);
  });
});

describe("task registry (DEC-003)", () => {
  it.each(AI_TASKS.map((t) => [t.id]))("%s: defaults are complete and valid", (id) => {
    const task = taskSpec(id as AiTaskId);
    expect(findModel(task.defaults.model)).toBeDefined();
    for (const language of task.languages) {
      const texts = task.defaults.texts[language];
      expect(texts, `${id} ${language}`).toBeDefined();
      expect(Object.keys(texts!).sort()).toEqual(task.parts.map((p) => p.key).sort());
    }
    // The defaults pass the same strict check an admin save goes through.
    expect(validateOverride(task.id, { texts: task.defaults.texts }, { requireProviderKey: true })).toEqual([]);
  });
});

describe("settings merge and validation (REQ-002, REQ-003, REQ-006)", () => {
  it("runs on defaults with an empty version when nothing is stored", () => {
    const settings = mergeTaskSettings("deepen", null);
    expect(settings).toMatchObject({ model: "claude-sonnet-4-6", maxOutputTokens: 2600, temperature: 0.4, version: "" });
  });

  it("applies a valid override and gives it a version", () => {
    const settings = mergeTaskSettings("oracle", {
      model: "claude-haiku-4-5",
      maxOutputTokens: 3000,
      temperature: 0.7,
      texts: { en: { user: "Answer {{question}} from {{chart}}." } },
    });
    expect(settings).toMatchObject({ model: "claude-haiku-4-5", maxOutputTokens: 3000, temperature: 0.7 });
    expect(textsFor(settings, "en").user).toBe("Answer {{question}} from {{chart}}.");
    expect(textsFor(settings, "ru").user).toBe(taskSpec("oracle").defaults.texts.ru!.user);
    expect(settings.version).toMatch(/^[0-9a-f]{16}$/);
  });

  it("falls back to the default for each invalid stored part only", () => {
    const settings = mergeTaskSettings("oracle", {
      model: "gpt-unknown",
      maxOutputTokens: 999_999,
      texts: { en: { user: "No placeholders at all", system: "Short system. {{personalBlock}}" } },
    });
    expect(settings.model).toBe("claude-opus-4-8");
    expect(settings.maxOutputTokens).toBe(2400);
    expect(textsFor(settings, "en").user).toBe(taskSpec("oracle").defaults.texts.en!.user);
    expect(textsFor(settings, "en").system).toBe("Short system. {{personalBlock}}");
  });

  it("never sends temperature to a model that rejects it", () => {
    expect(mergeTaskSettings("deepen", { model: "claude-opus-4-8" }).temperature).toBeNull();
    expect(mergeTaskSettings("deepen", { model: "claude-opus-4-8", temperature: 0.9 }).temperature).toBeNull();
  });

  it("refuses invalid overrides with every problem listed", () => {
    const problems = validateOverride(
      "oracle",
      {
        model: "claude-opus-4-8",
        maxOutputTokens: 10,
        temperature: 0.5,
        texts: { en: { user: "{{question}} {{unknownThing}}", system: "" }, ru: { nope: "x" } },
      },
      { requireProviderKey: true },
    );
    expect(problems).toEqual([
      "Output limit must be a whole number from 256 to 32000",
      "Claude Opus 4.8 does not accept a temperature",
      "User message (EN) is missing {{chart}}",
      "User message (EN) uses unknown {{unknownThing}}",
      "System prompt (EN) is empty",
      'Unknown prompt part "nope"',
    ]);
  });

  it("refuses a model whose provider has no API key, and an unknown model", () => {
    expect(validateOverride("forecast", { model: "gpt-6.1-sol" }, { requireProviderKey: true })).toEqual([
      "GPT-6.1 Sol is unavailable: the openai API key is not configured",
    ]);
    expect(validateOverride("forecast", { model: "gpt-6.1-sol" }, { requireProviderKey: false })).toEqual([]);
    expect(validateOverride("forecast", { model: "made-up" }, { requireProviderKey: false })).toEqual(['Unknown model "made-up"']);
  });

  it("refuses texts longer than 20,000 characters and texts in a language the task does not have", () => {
    const long = "{{question}} {{chart}} " + "x".repeat(20_000);
    expect(validateOverride("oracle", { texts: { en: { user: long } } }, { requireProviderKey: false })).toEqual([
      "User message (EN) is longer than 20000 characters",
    ]);
    expect(validateOverride("factExtraction", { texts: { en: { user: "{{question}}" } } }, { requireProviderKey: false })).toEqual([
      "Fact extraction has no EN texts",
    ]);
  });

  it("keeps only what differs from the defaults", () => {
    const task = taskSpec("forecast");
    expect(
      minimalOverride("forecast", {
        model: task.defaults.model,
        maxOutputTokens: 1500,
        temperature: task.defaults.temperature,
        texts: { en: { system: task.defaults.texts.en!.system, user: "Today {{today}}: {{chart}}" } },
      }),
    ).toEqual({ maxOutputTokens: 1500, texts: { en: { user: "Today {{today}}: {{chart}}" } } });
  });
});

describe("settings store (DEC-001, DEC-013)", () => {
  it("saves the minimal override with who saved it, and deletes the document when nothing differs", async () => {
    const saved = await saveTaskOverride("forecast", { maxOutputTokens: 1500 }, "admin@example.com");
    const doc = h.fake.all("aiSettings").get("forecast");
    expect(doc).toMatchObject({ maxOutputTokens: 1500, updatedBy: "admin@example.com" });
    expect(Object.values(doc!).includes(undefined)).toBe(false);
    expect(saved.maxOutputTokens).toBe(1500);

    await saveTaskOverride("forecast", { maxOutputTokens: taskSpec("forecast").defaults.maxOutputTokens }, "admin@example.com");
    expect(h.fake.all("aiSettings").has("forecast")).toBe(false);
  });

  it("resets a task to its defaults", async () => {
    h.fake.seed("aiSettings", "oracle", { model: "claude-haiku-4-5" });
    expect((await resetTaskOverride("oracle")).model).toBe("claude-opus-4-8");
    expect(h.fake.all("aiSettings").has("oracle")).toBe(false);
  });

  it("caches settings for 60 seconds per instance", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-18T10:00:00Z"));
    expect((await loadTaskSettings("oracle")).model).toBe("claude-opus-4-8");
    h.fake.seed("aiSettings", "oracle", { model: "claude-haiku-4-5" });
    vi.setSystemTime(new Date("2026-10-18T10:00:59Z"));
    expect((await loadTaskSettings("oracle")).model).toBe("claude-opus-4-8");
    vi.setSystemTime(new Date("2026-10-18T10:01:01Z"));
    expect((await loadTaskSettings("oracle")).model).toBe("claude-haiku-4-5");
  });

  it("uses the defaults when the store cannot be read", async () => {
    h.failReads = true;
    expect(await loadTaskSettings("letterWriting")).toEqual(defaultTaskSettings("letterWriting"));
  });
});

describe("cache keys follow the settings (DEC-004, REQ-007)", () => {
  const profile = {
    id: "p1",
    birthDate: "1990-04-02",
    birthTime: "14:30",
    timeUnknown: false,
    lat: 1,
    lng: 2,
    timezone: "UTC",
  } as Profile;
  const sections = [{ title: "T", body: "B" }];

  it("keeps the premium PDF cache key unchanged on default settings", () => {
    const expected = createHash("sha256")
      .update(
        JSON.stringify({
          rendererVersion: "2",
          profileId: "p1",
          birthDate: "1990-04-02",
          birthTime: "14:30",
          timeUnknown: false,
          lat: 1,
          lng: 2,
          timezone: "UTC",
          relocationLat: null,
          relocationLng: null,
          language: "en",
          sections: [{ title: "T", body: "B", category: null, detail: null }],
        }),
      )
      .digest("hex");
    const key = computePremiumPdfCacheKey({ profile, language: "en", sections, settings: defaultTaskSettings("premiumPdf") });
    expect(key).toBe(expected);
  });

  it("changes the key when the settings change", () => {
    const custom = mergeTaskSettings("premiumPdf", { maxOutputTokens: 9000 });
    const a = computePremiumPdfCacheKey({ profile, language: "en", sections, settings: defaultTaskSettings("premiumPdf") });
    const b = computePremiumPdfCacheKey({ profile, language: "en", sections, settings: custom });
    expect(a).not.toBe(b);
    expect(settingsKeyPart(custom)).toEqual({ aiSettings: custom.version });
    expect(settingsKeyPart(defaultTaskSettings("deepen"))).toEqual({});
  });
});
