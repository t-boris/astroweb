import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ChartResult } from "../types";

/** Real backend results (calcVersion 2) for the natal-parity datasets; see fixtures/charts.json. */
export type FixtureName = "A" | "B" | "C" | "D" | "unknownTime" | "fallback";

export function loadFixtures(): { charts: Record<FixtureName, ChartResult> } {
  const raw = readFileSync(join(__dirname, "fixtures", "charts.json"), "utf-8");
  return JSON.parse(raw) as { charts: Record<FixtureName, ChartResult> };
}
