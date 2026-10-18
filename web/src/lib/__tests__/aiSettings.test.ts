import { describe, expect, it } from "vitest";
import type { AiModelInfo, AiTask } from "@/api/adminAi";
import {
  draftChanged,
  draftFromTask,
  draftIssues,
  draftOverride,
  formatUsd,
  modelSettingsAreCustom,
  partIsCustom,
  partIssues,
  placeholdersIn,
  withModel,
  withText,
} from "@/lib/aiSettings";

const model = (over: Partial<AiModelInfo>): AiModelInfo => ({
  id: "m",
  provider: "anthropic",
  label: "M",
  inputPerMTok: 1,
  outputPerMTok: 5,
  nextPrice: null,
  maxOutputTokens: 32000,
  temperature: true,
  webSearch: true,
  available: true,
  ...over,
});

const models = [
  model({ id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" }),
  model({ id: "claude-opus-4-8", label: "Claude Opus 4.8", temperature: false }),
  model({ id: "gpt-6-astra", label: "GPT-6 Astra", provider: "openai", temperature: false, available: false }),
];
const limits = { minOutputTokens: 256, maxOutputTokens: 32000, maxPromptLength: 20000 };

const task: AiTask = {
  id: "deepen",
  label: "Deeper interpretation",
  description: "",
  languages: ["en", "ru"],
  parts: [
    { key: "system", label: "System prompt", description: "", placeholders: [] },
    {
      key: "user",
      label: "User message",
      description: "",
      placeholders: [
        { name: "focus", description: "" },
        { name: "chart", description: "" },
        { name: "language", description: "", optional: true },
      ],
    },
  ],
  testInputs: ["topic", "baseInterpretation"],
  needsWebSearch: false,
  defaults: {
    model: "claude-sonnet-4-6",
    maxOutputTokens: 2600,
    temperature: 0.4,
    texts: {
      en: { system: "Be focused.", user: "Focus {{focus}} in {{language}}: {{chart}}" },
      ru: { system: "Фокус.", user: "Фокус {{focus}}: {{chart}}" },
    },
  },
  override: {},
  effective: {
    model: "claude-sonnet-4-6",
    maxOutputTokens: 2600,
    temperature: 0.4,
    texts: {
      en: { system: "Be focused.", user: "Focus {{focus}} in {{language}}: {{chart}}" },
      ru: { system: "Фокус.", user: "Фокус {{focus}}: {{chart}}" },
    },
    version: "",
  },
  updatedAt: null,
  updatedBy: null,
};

describe("admin AI draft helpers", () => {
  it("starts from the effective settings without sharing objects with the task", () => {
    const draft = draftFromTask(task);
    expect(draftChanged(task, draft)).toBe(false);
    const edited = withText(draft, "en", "system", "New system.");
    expect(task.effective.texts.en!.system).toBe("Be focused.");
    expect(draftChanged(task, edited)).toBe(true);
    expect(partIsCustom(task, edited, "en", "system")).toBe(true);
    expect(partIsCustom(task, edited, "ru", "system")).toBe(false);
    expect(draftOverride(edited).texts!.en!.system).toBe("New system.");
  });

  it("drops temperature for a model that rejects it and restores the default for one that accepts it", () => {
    const draft = draftFromTask(task);
    const onOpus = withModel(draft, models[1], task);
    expect(onOpus.temperature).toBeNull();
    expect(modelSettingsAreCustom(task, onOpus)).toBe(true);
    const back = withModel(onOpus, models[0], task);
    expect(back.temperature).toBe(0.4);
    expect(modelSettingsAreCustom(task, back)).toBe(false);
    expect(withModel({ ...draft, maxOutputTokens: 30000 }, model({ id: "small", maxOutputTokens: 8000 }), task).maxOutputTokens).toBe(8000);
  });

  it("reports the same problems the server refuses", () => {
    const draft = withText(draftFromTask(task), "ru", "user", "Фокус {{focus}} {{oops}}");
    expect(draftIssues(task, { ...draft, model: "gpt-6-astra", maxOutputTokens: 100, temperature: 2 }, { models, limits })).toEqual([
      "GPT-6 Astra is unavailable: the openai API key is not configured",
      "Output limit must be a whole number from 256 to 32000",
      "GPT-6 Astra does not accept a temperature",
      "User message (RU) is missing {{chart}}",
      "User message (RU) uses unknown {{oops}}",
    ]);
    expect(draftIssues(task, draftFromTask(task), { models, limits })).toEqual([]);
  });

  it("checks one prompt part: empty, too long, optional placeholders", () => {
    const part = task.parts[1];
    expect(partIssues(part, "en", "  ", 100)).toEqual(["User message (EN) is empty"]);
    expect(partIssues(part, "en", "{{focus}} {{chart}}" + "x".repeat(100), 100)).toEqual([
      "User message (EN) is longer than 100 characters",
    ]);
    expect(partIssues(part, "en", "{{focus}} {{chart}}", 100)).toEqual([]);
  });

  it("lists placeholders and formats costs", () => {
    expect(placeholdersIn("{{a}} {{ b }} {{a}} {\"x\":{\"y\":1}}")).toEqual(["a", "b"]);
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(0.00175)).toBe("$0.0018");
    expect(formatUsd(1.234)).toBe("$1.23");
  });
});
