/**
 * getChart Cloud Function — cache-through chart retrieval.
 *
 * Validates input, enforces deviceId ownership, checks cache first.
 * If cache hit: returns { cached: true, chart: ChartResult }.
 * If cache miss: computes chart, stores in cache, returns { cached: false, chart: ChartResult }.
 *
 * The cached boolean lets the client know whether this was a fresh computation.
 */
export declare const getChart: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    cached: boolean;
    chart: import("../types").ChartResult;
}>, unknown>;
