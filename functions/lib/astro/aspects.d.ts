import { ChartAspect } from '../types/index';
/**
 * Compute the angular difference between two ecliptic longitudes.
 * Handles the 0/360 wrap-around correctly, always returning a value in [0, 180].
 */
export declare function angularDifference(lon1: number, lon2: number): number;
/**
 * Detect whether two points form a major aspect.
 * Returns the aspect details if found, or null if no aspect within orb.
 */
export declare function detectAspect(nameA: string, lonA: number, nameB: string, lonB: number): ChartAspect | null;
/** A point with name and longitude, used for batch aspect detection */
export interface AspectPoint {
    name: string;
    lon: number;
}
/**
 * Detect all major aspects among an array of chart points.
 * Uses triangular iteration (i < j) to avoid duplicate pairs.
 * Points should include all 10 planets plus ASC and MC (12 points, 66 pairs).
 * Results are sorted by exactness descending (most exact first).
 */
export declare function detectAllAspects(points: AspectPoint[]): ChartAspect[];
