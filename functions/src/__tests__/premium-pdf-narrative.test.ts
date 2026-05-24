import { describe, expect, it } from "vitest";
import { parsePremiumPdfNarrative } from "../services/anthropic";

describe("parsePremiumPdfNarrative", () => {
  it("extracts marked premium PDF sections", () => {
    const parsed = parsePremiumPdfNarrative([
      "[PLANETS]",
      "Planet text",
      "",
      "[HOUSES]",
      "House text",
      "[ASPECTS]",
      "Aspect text",
      "[PORTRAIT]",
      "Portrait text",
      "[END_OF_REPORT]",
    ].join("\n"));

    expect(parsed).toEqual({
      planets: "Planet text",
      houses: "House text",
      aspects: "Aspect text",
      portrait: "Portrait text",
    });
  });
});
