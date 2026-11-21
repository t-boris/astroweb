import { SHARED_ASPECT_DEFINITIONS } from './constants';
import { signedDifference } from './points';
import type { SharedAspect } from '../types/index';

/** A point that can take part in the shared aspect set. */
export interface AspectEndpoint {
  id: string;
  lon: number;
  /** Daily rate in degrees (negative when retrograde). */
  rate: number;
}

const LUMINARIES = new Set(['Sun', 'Moon']);
const ANGLES = new Set(['ASC', 'DSC', 'MC', 'IC']);
/** Points that move with the daily rotation of the sky; no applying or separating status between two of them. */
const DAILY_POINTS = new Set(['ASC', 'DSC', 'MC', 'IC', 'Vertex', 'Fortune']);

function roundTo(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/**
 * Find the aspect between two points, if any (DEC-017).
 *
 * The closest supported type inside its orb wins, so a pair has at most one aspect.
 * signedOrb is the actual angle minus the exact angle, as printed by Astro-Seek.
 * An aspect is applying when its orb shrinks with time. An exact aspect counts as
 * separating. Two points of the daily rotation (ASC, DSC, MC, IC, Vertex, Fortune) get no status.
 */
export function detectSharedAspect(a: AspectEndpoint, b: AspectEndpoint): SharedAspect | null {
  if (ANGLES.has(a.id) && ANGLES.has(b.id)) return null;

  const delta = signedDifference(a.lon, b.lon);
  const separation = Math.abs(delta);
  const luminary = LUMINARIES.has(a.id) || LUMINARIES.has(b.id);

  let best: { def: (typeof SHARED_ASPECT_DEFINITIONS)[number]; signed: number; max: number } | null = null;
  for (const def of SHARED_ASPECT_DEFINITIONS) {
    const max = luminary ? def.luminaryOrb : def.orb;
    const signed = separation - def.angle;
    if (Math.abs(signed) <= max && (best === null || Math.abs(signed) < Math.abs(best.signed))) {
      best = { def, signed, max };
    }
  }
  if (best === null) return null;

  const orbRate = Math.sign(best.signed) * Math.sign(delta) * (b.rate - a.rate);
  const absOrb = Math.abs(best.signed);

  return {
    a: a.id,
    b: b.id,
    type: best.def.type,
    major: best.def.major,
    orb: roundTo(absOrb, 4),
    signedOrb: roundTo(best.signed, 4),
    maxOrb: best.max,
    exactness: roundTo(1 - absOrb / best.max, 4),
    applying: DAILY_POINTS.has(a.id) && DAILY_POINTS.has(b.id) ? null : best.signed !== 0 && orbRate < 0,
  };
}

/**
 * Compute the shared aspect set for every pair of endpoints.
 * Triangular iteration, sorted by exactness (most exact first) with the point ids as tie-break.
 */
export function computeSharedAspects(endpoints: AspectEndpoint[]): SharedAspect[] {
  const aspects: SharedAspect[] = [];
  for (let i = 0; i < endpoints.length - 1; i++) {
    for (let j = i + 1; j < endpoints.length; j++) {
      const aspect = detectSharedAspect(endpoints[i], endpoints[j]);
      if (aspect !== null) aspects.push(aspect);
    }
  }
  aspects.sort(
    (x, y) => y.exactness - x.exactness || `${x.a}|${x.b}`.localeCompare(`${y.a}|${y.b}`)
  );
  return aspects;
}
