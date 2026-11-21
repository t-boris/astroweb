import { describe, expect, it } from "vitest";
import { spreadLabels, type SpreadInput } from "../labelSpread";

const EPS = 1e-6;

/** Gaps between neighbours around the circle, in the circular order of `positions`. */
function circularGaps(positions: number[]): number[] {
  const sorted = [...positions].sort((a, b) => a - b);
  return sorted.map((value, i) => (i === sorted.length - 1 ? sorted[0] + 360 - value : sorted[i + 1] - value));
}

/** Ids in the circular order of `angles`, starting from the id at the smallest angle. */
function circularOrder(items: { id: string; angle: number }[]): string[] {
  return [...items].sort((a, b) => a.angle - b.angle).map((item) => item.id);
}

/** True when two cyclic sequences are the same up to where they start. */
function sameCycle(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  if (a.length === 0) return true;
  const start = b.indexOf(a[0]);
  if (start < 0) return false;
  return a.every((id, i) => b[(start + i) % b.length] === id);
}

describe("spreadLabels", () => {
  it("returns nothing for nothing and leaves a single label where it is", () => {
    expect(spreadLabels([], 7)).toEqual([]);
    expect(spreadLabels([{ id: "Sun", angle: 123.4 }], 7)).toEqual([
      { id: "Sun", angle: 123.4, position: 123.4, offset: 0 },
    ]);
  });

  it("does not move labels that already have room", () => {
    const items: SpreadInput[] = [
      { id: "a", angle: 10 },
      { id: "b", angle: 100 },
      { id: "c", angle: 250 },
    ];
    for (const result of spreadLabels(items, 7)) expect(result.offset).toBe(0);
  });

  it("returns one result per input, in the input order, never dropping a label", () => {
    const items: SpreadInput[] = [
      { id: "z", angle: 200 },
      { id: "y", angle: 10 },
      { id: "x", angle: 12 },
      { id: "w", angle: 11 },
    ];
    expect(spreadLabels(items, 7).map((r) => r.id)).toEqual(["z", "y", "x", "w"]);
  });

  it("spreads a pile of labels evenly around their common position", () => {
    const results = spreadLabels(
      [
        { id: "a", angle: 100 },
        { id: "b", angle: 100 },
        { id: "c", angle: 100 },
      ],
      6,
    );
    expect(results.map((r) => r.position)).toEqual([
      expect.closeTo(94, 5),
      expect.closeTo(100, 5),
      expect.closeTo(106, 5),
    ]);
  });

  it("keeps the order of the exact positions", () => {
    const items: SpreadInput[] = [
      { id: "a", angle: 50 },
      { id: "b", angle: 52 },
      { id: "c", angle: 53 },
      { id: "d", angle: 58 },
      { id: "e", angle: 61 },
    ];
    const results = spreadLabels(items, 7.5);
    expect(circularOrder(results.map((r) => ({ id: r.id, angle: r.position })))).toEqual(["a", "b", "c", "d", "e"]);
    for (const gap of circularGaps(results.map((r) => r.position))) expect(gap).toBeGreaterThanOrEqual(7.5 - EPS);
  });

  it("wraps around 0 and 360 degrees", () => {
    const items: SpreadInput[] = [
      { id: "a", angle: 359 },
      { id: "b", angle: 1 },
      { id: "c", angle: 3 },
      { id: "d", angle: 180 },
    ];
    const results = spreadLabels(items, 6);
    for (const result of results) {
      expect(result.position).toBeGreaterThanOrEqual(0);
      expect(result.position).toBeLessThan(360);
    }
    for (const gap of circularGaps(results.map((r) => r.position))) expect(gap).toBeGreaterThanOrEqual(6 - EPS);
    // The cyclic order a, b, c, d is unchanged although the cluster straddles 0 degrees.
    const before = circularOrder(items);
    const after = circularOrder(results.map((r) => ({ id: r.id, angle: r.position })));
    expect(sameCycle(before, after)).toBe(true);
    // The cluster around 0 degrees moved by less than the cluster needs in total.
    const moved = results.filter((r) => r.id !== "d").map((r) => Math.abs(r.offset));
    expect(Math.max(...moved)).toBeLessThan(10);
  });

  it("reports the offset along the shorter arc across 0 degrees", () => {
    const [a, b] = spreadLabels(
      [
        { id: "a", angle: 359 },
        { id: "b", angle: 1 },
      ],
      6,
    );
    expect(a.offset).toBeCloseTo(-2, 5);
    expect(b.offset).toBeCloseTo(2, 5);
    expect(a.position).toBeCloseTo(357, 5);
    expect(b.position).toBeCloseTo(3, 5);
  });

  it("normalizes angles outside 0..360", () => {
    const [a] = spreadLabels([{ id: "a", angle: -30 }], 6);
    expect(a.angle).toBeCloseTo(330, 9);
    expect(a.position).toBeCloseTo(330, 9);
  });

  it("separates crowded charts: sixteen points in a quarter of the circle", () => {
    const items: SpreadInput[] = Array.from({ length: 16 }, (_, i) => ({ id: `p${i}`, angle: 40 + i * 2.3 }));
    const results = spreadLabels(items, 7.5);
    expect(results).toHaveLength(16);
    for (const gap of circularGaps(results.map((r) => r.position))) expect(gap).toBeGreaterThanOrEqual(7.5 - EPS);
    expect(circularOrder(results.map((r) => ({ id: r.id, angle: r.position }))).join()).toBe(items.map((i) => i.id).join());
  });

  it("falls back to an even spacing when the circle cannot hold the gap", () => {
    const items: SpreadInput[] = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, angle: i }));
    const results = spreadLabels(items, 20);
    expect(results).toHaveLength(40);
    for (const gap of circularGaps(results.map((r) => r.position))) expect(gap).toBeGreaterThanOrEqual(9 - 1e-4);
  });

  it("is deterministic and does not modify its input", () => {
    const items: SpreadInput[] = [
      { id: "a", angle: 10 },
      { id: "b", angle: 10 },
    ];
    const copy = JSON.parse(JSON.stringify(items)) as SpreadInput[];
    expect(spreadLabels(items, 6)).toEqual(spreadLabels(items, 6));
    expect(items).toEqual(copy);
  });

  describe("fixed labels", () => {
    it("never moves a fixed label; the free label next to it takes the whole shortfall", () => {
      const results = spreadLabels(
        [
          { id: "fixed", angle: 100, fixed: true },
          { id: "free", angle: 102 },
        ],
        7,
      );
      expect(results[0].position).toBe(100);
      expect(results[0].offset).toBe(0);
      expect(results[1].position).toBeCloseTo(107, 6);
    });

    it("pushes the free label away on the side it came from", () => {
      const [free] = spreadLabels(
        [
          { id: "free", angle: 98 },
          { id: "fixed", angle: 100, fixed: true },
        ],
        7,
      );
      expect(free.position).toBeCloseTo(93, 6);
    });

    it("leaves two fixed labels alone even when they are too close, and still places the free ones", () => {
      const results = spreadLabels(
        [
          { id: "a", angle: 10, fixed: true },
          { id: "b", angle: 12, fixed: true },
          { id: "free", angle: 200 },
        ],
        7,
      );
      expect(results[0].position).toBe(10);
      expect(results[1].position).toBe(12);
      expect(results[2].position).toBe(200);
    });

    it("moves a crowd around a fixed label without changing the order or leaving a gap smaller than asked", () => {
      const items: SpreadInput[] = [
        { id: "a", angle: 96 },
        { id: "b", angle: 99 },
        { id: "fixed", angle: 100, fixed: true },
        { id: "c", angle: 101 },
        { id: "d", angle: 104 },
      ];
      const results = spreadLabels(items, 7);
      expect(results[2].position).toBe(100);
      for (const gap of circularGaps(results.map((r) => r.position))) expect(gap).toBeGreaterThanOrEqual(7 - EPS);
      expect(circularOrder(results.map((r) => ({ id: r.id, angle: r.position }))).join()).toBe("a,b,fixed,c,d");
    });

    it("wraps around 0 degrees with a fixed label", () => {
      const results = spreadLabels(
        [
          { id: "fixed", angle: 359, fixed: true },
          { id: "free", angle: 2 },
        ],
        7,
      );
      expect(results[0].position).toBe(359);
      expect(results[1].position).toBeCloseTo(6, 6);
    });
  });
});
