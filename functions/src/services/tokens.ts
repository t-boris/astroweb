/** Token cost per premium action. Stars are spent from the per-user wallet
 * (see services/wallet.ts), not from individual profiles. */
export const TOKEN_COST = {
  oracle: 1,
  deepen: 1,
  compatibility: 2,
  pdf: 4,
} as const;
