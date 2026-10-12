import { createHash } from "node:crypto";

/**
 * Deterministic cache key for AI generations. Identical inputs → identical key,
 * so an already-generated result can be reused instead of calling Claude again.
 */
export function hashCacheKey(parts: unknown): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}
