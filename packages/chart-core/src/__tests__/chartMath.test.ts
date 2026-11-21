import { describe, expect, it } from "vitest";
import {
  describeSector,
  eclipticToSvgAngle,
  normalizeDegrees,
  polarToCartesian,
  signedAngleDelta,
} from "../chartMath";
import { CHART_LAYOUT } from "../constants";
import { wheelRotation } from "../positions";
import { loadFixtures } from "./chartFixtures";

const { cx, cy } = CHART_LAYOUT;
const R = 100;

function at(lon: number, rotation: number) {
  return polarToCartesian(cx, cy, R, eclipticToSvgAngle(lon, rotation));
}

describe("normalizeDegrees / signedAngleDelta", () => {
  it("normalizes to [0, 360) and leaves values in range alone", () => {
    expect(normalizeDegrees(370)).toBe(10);
    expect(normalizeDegrees(-10)).toBe(350);
    expect(normalizeDegrees(0.1)).toBe(0.1);
    expect(Object.is(normalizeDegrees(-0), 0)).toBe(true);
    expect(Object.is(normalizeDegrees(360), 0)).toBe(true);
  });

  it("measures the shorter signed arc", () => {
    expect(signedAngleDelta(350, 10)).toBe(20);
    expect(signedAngleDelta(10, 350)).toBe(-20);
    expect(signedAngleDelta(0, 180)).toBe(180);
  });
});

describe("eclipticToSvgAngle with the wheel rotation", () => {
  it("puts the rotation longitude on the left (9 o'clock) axis", () => {
    for (const rotation of [0, 37.5, 300, 324.98, 359.9]) {
      const left = at(rotation, rotation);
      expect(left.x).toBeCloseTo(cx - R, 9);
      expect(left.y).toBeCloseTo(cy, 9);
    }
  });

  it("runs the zodiac counter-clockwise: longitude grows from the left axis towards 6 o'clock", () => {
    const quarter = at(90, 0);
    expect(quarter.x).toBeCloseTo(cx, 9);
    expect(quarter.y).toBeCloseTo(cy + R, 9); // below the centre
    const half = at(180, 0);
    expect(half.x).toBeCloseTo(cx + R, 9); // 3 o'clock
    const threeQuarter = at(270, 0);
    expect(threeQuarter.y).toBeCloseTo(cy - R, 9); // 12 o'clock
  });

  it("is a rigid rotation: moving the rotation by d moves every longitude by d", () => {
    expect(eclipticToSvgAngle(100, 40) - eclipticToSvgAngle(100, 70)).toBe(30);
    expect(eclipticToSvgAngle(110, 50) - eclipticToSvgAngle(100, 50)).toBe(10);
  });

  it("starts the zodiac at 0 degrees Aries on the left axis when the time is unknown", () => {
    const { charts } = loadFixtures();
    expect(wheelRotation(charts.unknownTime)).toBe(0);
    const aries = at(0, wheelRotation(charts.unknownTime));
    expect(aries.x).toBeCloseTo(cx - R, 9);
    expect(aries.y).toBeCloseTo(cy, 9);
  });
});

describe("orientation of the reference charts", () => {
  const { charts } = loadFixtures();

  it("Koch: the ASC lies on the left axis and the MC near the top", () => {
    const c = charts.C;
    const rotation = wheelRotation(c);
    const asc = at(c.houses.asc as number, rotation);
    expect(asc.y).toBeCloseTo(cy, 6);
    expect(asc.x).toBeLessThan(cx);
    const mc = at(c.houses.mc as number, rotation);
    expect(mc.y).toBeLessThan(cy);
  });

  it("Whole Sign: house 1 starts on the left axis and the ASC is drawn inside house 1, below it", () => {
    // Dataset A (SRC-002): house 1 is Aquarius, ASC 24 degrees 58 minutes Aquarius.
    const c = charts.A;
    const rotation = wheelRotation(c);
    expect(rotation).toBe(c.houses.cusps[0]);
    const cusp1 = at(c.houses.cusps[0], rotation);
    expect(cusp1.y).toBeCloseTo(cy, 9);
    const asc = at(c.houses.asc as number, rotation);
    // The ASC is not on the axis: it is 24.98 degrees along the zodiac, towards 6 o'clock.
    expect(asc.y).toBeGreaterThan(cy + 10);
    expect(asc.x).toBeLessThan(cx);
    // MC 20 degrees 37 minutes Scorpio is in the upper left, as in the reference picture.
    const mc = at(c.houses.mc as number, rotation);
    expect(mc.x).toBeLessThan(cx);
    expect(mc.y).toBeLessThan(cy);
  });

  it("Whole Sign: the ASC is 24.98 degrees from the left axis, not on it", () => {
    const c = charts.A;
    const delta = eclipticToSvgAngle(c.houses.asc as number, wheelRotation(c)) - 180;
    expect(delta).toBeCloseTo(24.98, 2);
  });
});

describe("describeSector", () => {
  it("draws a sign wedge as a closed annulus segment for increasing angles", () => {
    const path = describeSector(cx, cy, 374, 430, 180, 210);
    expect(path.startsWith("M ")).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
    // Outer arc counter-clockwise (sweep 0), inner arc back (sweep 1), both small arcs.
    expect(path).toContain("A 430 430 0 0 0");
    expect(path).toContain("A 374 374 0 0 1");
  });
});
