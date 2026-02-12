import { ASPECT_DEFINITIONS } from './constants';
import { ChartAspect } from '../types/index';

/**
 * Compute the angular difference between two ecliptic longitudes.
 * Handles the 0/360 wrap-around correctly, always returning a value in [0, 180].
 */
export function angularDifference(lon1: number, lon2: number): number {
  const raw = Math.abs(lon1 - lon2) % 360;
  return raw > 180 ? 360 - raw : raw;
}

/**
 * Detect whether two points form a major aspect.
 * Returns the aspect details if found, or null if no aspect within orb.
 */
export function detectAspect(
  nameA: string,
  lonA: number,
  nameB: string,
  lonB: number
): ChartAspect | null {
  const diff = angularDifference(lonA, lonB);

  for (const def of ASPECT_DEFINITIONS) {
    const deviation = Math.abs(diff - def.angle);
    if (deviation <= def.orb) {
      return {
        a: nameA,
        b: nameB,
        type: def.type,
        orb: Math.round(deviation * 100) / 100,
        exactness: Math.round((1 - deviation / def.orb) * 100) / 100,
      };
    }
  }

  return null;
}

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
export function detectAllAspects(points: AspectPoint[]): ChartAspect[] {
  const aspects: ChartAspect[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const aspect = detectAspect(
        points[i].name,
        points[i].lon,
        points[j].name,
        points[j].lon
      );
      if (aspect !== null) {
        aspects.push(aspect);
      }
    }
  }

  // Sort by exactness descending (most exact first)
  aspects.sort((a, b) => b.exactness - a.exactness);

  return aspects;
}
