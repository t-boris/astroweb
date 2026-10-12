// Token economy (mirrors functions/src/services/tokens.ts & starPacks.ts).
// 1 token = $0.99. Shown in the UI as stars (✦).

export const TOKEN_COST = {
  oracle: 1,
  compatibility: 2,
  pdf: 4,
} as const;

export const STAR = "✦";

export type StarPackId = "question" | "pair" | "reading" | "reading_pair" | "all";

export interface StarPack {
  id: StarPackId;
  /** Base stars credited. */
  stars: number;
  /** Bonus stars credited on top (shown as a perk). */
  bonusStars?: number;
  /** Normal charm price in USD. */
  priceUsd: number;
  /** One-time first-purchase price (only the reading pack). */
  firstPriceUsd?: number;
  /** Highlighted as the all-in-one headline pack. */
  popular?: boolean;
}

/**
 * Outcome-framed star packs (a ladder, not raw "N credits"). Prices and
 * credited stars are re-resolved server-side from the matching `packId` — these
 * values are for display only.
 */
export const STAR_PACKS: StarPack[] = [
  { id: "question", stars: 1, priceUsd: 0.99 },
  { id: "pair", stars: 2, priceUsd: 1.99 },
  { id: "reading", stars: 4, priceUsd: 3.99, firstPriceUsd: 1.99, popular: true },
  { id: "reading_pair", stars: 6, priceUsd: 5.99 },
  { id: "all", stars: 7, bonusStars: 1, priceUsd: 6.99 },
];

/** Render a star token amount, e.g. stars(4) -> "✦4". */
export function stars(n: number): string {
  return `${STAR}${n}`;
}
