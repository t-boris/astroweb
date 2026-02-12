import { SIGN_ELEMENTS } from "@/components/chart/utils/constants";
import type { ChartResult, ChartAspect } from "@/types";

export interface InterpretationBlock {
  key: string; // i18n key path (e.g., "interpretation.sun.aries")
  category: "sun" | "moon" | "ascendant" | "midheaven" | "aspect";
  priority: number; // Higher = more important (for display order)
  tags: string[]; // Element/modality tags for styling
  aspect?: ChartAspect; // Original aspect data (for aspect blocks only)
}

function getSignFromLongitude(lon: number): string {
  const SIGNS = [
    "Aries",
    "Taurus",
    "Gemini",
    "Cancer",
    "Leo",
    "Virgo",
    "Libra",
    "Scorpio",
    "Sagittarius",
    "Capricorn",
    "Aquarius",
    "Pisces",
  ];
  const signIndex = Math.floor(lon / 30) % 12;
  return SIGNS[signIndex];
}

export function generateInterpretations(
  chart: ChartResult,
): InterpretationBlock[] {
  const blocks: InterpretationBlock[] = [];

  // 1. Sun in sign (always present)
  const sun = chart.points.find((p) => p.body === "Sun");
  if (sun) {
    blocks.push({
      key: `interpretation.sun.${sun.sign.toLowerCase()}`,
      category: "sun",
      priority: 100,
      tags: [SIGN_ELEMENTS[sun.sign], "identity"],
    });
  }

  // 2. Moon in sign (always present)
  const moon = chart.points.find((p) => p.body === "Moon");
  if (moon) {
    blocks.push({
      key: `interpretation.moon.${moon.sign.toLowerCase()}`,
      category: "moon",
      priority: 90,
      tags: [SIGN_ELEMENTS[moon.sign], "emotions"],
    });
  }

  // 3. ASC in sign (only if time known -- asc is non-null)
  if (chart.houses.asc !== null) {
    const ascSign = getSignFromLongitude(chart.houses.asc);
    blocks.push({
      key: `interpretation.ascendant.${ascSign.toLowerCase()}`,
      category: "ascendant",
      priority: 85,
      tags: [SIGN_ELEMENTS[ascSign], "appearance"],
    });
  }

  // 4. MC in sign (only if time known -- mc is non-null)
  if (chart.houses.mc !== null) {
    const mcSign = getSignFromLongitude(chart.houses.mc);
    blocks.push({
      key: `interpretation.midheaven.${mcSign.toLowerCase()}`,
      category: "midheaven",
      priority: 80,
      tags: [SIGN_ELEMENTS[mcSign], "career"],
    });
  }

  // 5. Top 3-5 aspects by exactness
  const topAspects = [...chart.aspects]
    .sort((a, b) => b.exactness - a.exactness)
    .slice(0, 5);

  for (const aspect of topAspects) {
    blocks.push({
      key: `interpretation.aspects.${aspect.type}`,
      category: "aspect",
      priority: 50 + Math.round(aspect.exactness * 20),
      tags: [aspect.type],
      aspect,
    });
  }

  return blocks.sort((a, b) => b.priority - a.priority);
}
