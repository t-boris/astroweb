/**
 * Star pack catalog — the single source of truth for what a purchase costs and
 * how many stars it credits. Prices and credited amounts are resolved
 * server-side (never trusted from the client). Packs are framed by outcome in
 * the UI (e.g. "Full reading + PDF"), but mechanically they just credit stars
 * to the per-user wallet, which are then spent on per-profile unlocks.
 */
export interface StarPack {
  id: string;
  /** Base stars credited on purchase. */
  stars: number;
  /** Extra stars credited as a bonus (e.g. the all-in-one pack). */
  bonusStars: number;
  /** Normal charm price in cents. */
  priceCents: number;
  /** One-time discounted price for a user's first reading purchase, if any. */
  firstPriceCents?: number;
}

export const STAR_PACKS: Record<string, StarPack> = {
  question: { id: "question", stars: 1, bonusStars: 0, priceCents: 99 },
  pair: { id: "pair", stars: 2, bonusStars: 0, priceCents: 199 },
  reading: { id: "reading", stars: 4, bonusStars: 0, priceCents: 399, firstPriceCents: 199 },
  reading_pair: { id: "reading_pair", stars: 6, bonusStars: 0, priceCents: 599 },
  all: { id: "all", stars: 7, bonusStars: 1, priceCents: 699 },
};

export function getStarPack(id: unknown): StarPack | null {
  if (typeof id !== "string") return null;
  return Object.prototype.hasOwnProperty.call(STAR_PACKS, id) ? STAR_PACKS[id] : null;
}
