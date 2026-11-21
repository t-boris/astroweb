/**
 * Label spreading for the points of the wheel (REQ-001): points that lie closer together than their
 * label stacks are moved apart along the circle, nothing is hidden, and the original order is kept.
 * Pure geometry on angles in degrees, no React dependency.
 */
import { normalizeDegrees, signedAngleDelta } from "./chartMath";

export interface SpreadInput {
  id: string;
  /** Exact angle in degrees. Any value; it is normalized to [0, 360). */
  angle: number;
  /** A fixed label never moves: its neighbours make room for it. Use it for labels that are already placed. */
  fixed?: boolean;
}

export interface SpreadResult {
  id: string;
  /** The exact angle, normalized to [0, 360). */
  angle: number;
  /** Where the label is drawn, normalized to [0, 360). */
  position: number;
  /** position - angle along the shorter arc, in (-180, 180]. Zero for a label that stays in place. */
  offset: number;
}

const TOLERANCE = 1e-9;
const MAX_SWEEPS = 2000;

/**
 * Move labels apart until every neighbour on the circle is at least `minGap` degrees away.
 *
 * Neighbours are taken in circular order of the exact angles; the order never changes. Each too-close
 * pair is pushed apart symmetrically, which keeps the mean of a cluster where it was, so a cluster
 * spreads around its exact positions. Labels that already have room are not moved by a pair that does
 * not touch them. A fixed label is never moved; the free label next to it takes the whole shortfall.
 * When the circle cannot hold `minGap` for everyone, the gap shrinks to an even spacing.
 * Results are returned in the order of the input.
 */
export function spreadLabels(items: readonly SpreadInput[], minGap: number): SpreadResult[] {
  const count = items.length;
  if (count === 0) return [];

  const exact = items.map((item) => normalizeDegrees(item.angle));
  // Circular order of the exact angles; ties keep the input order.
  const order = items.map((_, index) => index).sort((a, b) => exact[a] - exact[b] || a - b);
  const gap = Math.min(minGap, 360 / count);
  const positions = order.map((index) => exact[index]);

  if (count > 1) {
    for (let sweep = 0; sweep < MAX_SWEEPS; sweep++) {
      let worst = 0;
      for (let k = 0; k < count; k++) {
        const next = (k + 1) % count;
        // The last pair closes the circle: the first label is one turn ahead of the last.
        const distance = next === 0 ? positions[0] + 360 - positions[k] : positions[next] - positions[k];
        const shortfall = gap - distance;
        if (shortfall > TOLERANCE) {
          const firstFixed = items[order[k]].fixed === true;
          const secondFixed = items[order[next]].fixed === true;
          if (firstFixed && secondFixed) continue; // two fixed labels cannot make room for each other
          positions[k] -= firstFixed ? 0 : secondFixed ? shortfall : shortfall / 2;
          positions[next] += secondFixed ? 0 : firstFixed ? shortfall : shortfall / 2;
          worst = Math.max(worst, shortfall);
        }
      }
      if (worst <= TOLERANCE) break;
    }
  }

  const results: SpreadResult[] = new Array<SpreadResult>(count);
  order.forEach((index, k) => {
    const position = normalizeDegrees(positions[k]);
    results[index] = {
      id: items[index].id,
      angle: exact[index],
      position,
      offset: signedAngleDelta(exact[index], position),
    };
  });
  return results;
}
