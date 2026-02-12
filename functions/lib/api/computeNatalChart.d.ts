/**
 * computeNatalChart Cloud Function — computes a natal chart for a profile.
 *
 * Validates input, enforces deviceId ownership, checks cache, computes
 * chart via astro/chart.ts, stores result in Firestore, and returns
 * the ChartResult.
 */
export declare const computeNatalChart: import("firebase-functions/v2/https").CallableFunction<any, Promise<import("../types").ChartResult>, unknown>;
