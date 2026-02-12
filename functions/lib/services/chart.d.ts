import { ChartDocument, ChartResult } from "../types/index";
/**
 * Compute a deterministic SHA-256 hash of chart computation inputs.
 * Used for cache lookup — same inputs always produce the same hash.
 */
export declare function computeInputHash(inputs: {
    birthDate: string;
    birthTime: string | null;
    lat: number;
    lng: number;
    timezone: string;
    houseSystem: string;
}): string;
/**
 * Find a cached chart by profileId and inputHash.
 * Returns the chart document if found, null otherwise.
 */
export declare function findCachedChart(profileId: string, inputHash: string): Promise<ChartDocument | null>;
/**
 * Store a newly computed chart in Firestore.
 * Returns the full ChartDocument including the generated id.
 */
export declare function storeChart(profileId: string, inputHash: string, result: ChartResult): Promise<ChartDocument>;
/**
 * Get the most recent chart for a profile.
 * Returns the chart document or null if none exists.
 */
export declare function getChartByProfileId(profileId: string): Promise<ChartDocument | null>;
/**
 * Delete all charts for a profile (batch delete).
 * Useful for cleanup when a profile is deleted.
 * Idempotent — no error if no charts exist.
 */
export declare function deleteChartsByProfileId(profileId: string): Promise<void>;
