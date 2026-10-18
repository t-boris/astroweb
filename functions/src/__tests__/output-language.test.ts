import { describe, expect, it } from "vitest";
import {
  buildDeepInterpretationPrompt,
  buildOraclePrompt,
  normalizeLanguage,
  promptLanguage,
} from "../services/prompts";
import type { ChartResult } from "../types";

const chart = {
  points: [{ body: "Sun", sign: "Aries", degreeInSign: 12.5, house: 1 }],
  aspects: [],
  meta: { timeUsed: "12:00", zodiac: "tropical" },
} as unknown as ChartResult;

describe("output language", () => {
  it("accepts ru and falls back to en for unknown or removed values", () => {
    expect(normalizeLanguage("ru")).toBe("ru");
    expect(normalizeLanguage("uk")).toBe("en");
    expect(normalizeLanguage("de")).toBe("en");
    expect(normalizeLanguage(undefined)).toBe("en");
  });

  it("uses Russian templates for ru and English otherwise", () => {
    expect(promptLanguage("ru")).toBe("ru");
    expect(promptLanguage("en")).toBe("en");
  });

  it("builds en and ru prompts without extra output-language directives", () => {
    const en = buildOraclePrompt({ chart, question: "Q?", language: "en" });
    const ru = buildOraclePrompt({ chart, question: "Q?", language: "ru" });
    expect(en.systemInstruction).not.toContain("Write the entire response in");
    expect(ru.userPrompt).toContain("Вопрос пользователя:");
    const deep = buildDeepInterpretationPrompt({
      chart,
      focusTopic: "Sun in Aries",
      baseInterpretation: "Base",
      language: "en",
    });
    expect(deep.userPrompt).toContain("1) English, 150-250 words.");
  });
});
