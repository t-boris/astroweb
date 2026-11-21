/** Pure math utilities for chart coordinate conversion — no React dependency. */

export const DEG_TO_RAD = Math.PI / 180;

/** Normalize an angle in degrees to [0, 360). A value already in range is returned unchanged. */
export function normalizeDegrees(value: number): number {
  const remainder = value % 360;
  // "+ 0" turns a negative zero into 0.
  return (remainder < 0 ? remainder + 360 : remainder) + 0;
}

/** Signed shortest rotation from `from` to `to`, in (-180, 180]. */
export function signedAngleDelta(from: number, to: number): number {
  const delta = normalizeDegrees(to - from);
  return delta > 180 ? delta - 360 : delta;
}

/**
 * Convert ecliptic longitude to the angle used by polarToCartesian (degrees, counter-clockwise,
 * 0 = 3 o'clock). `rotation` is the longitude drawn on the left (9 o'clock) axis: the house 1 cusp
 * when the birth time is known, 0 degrees Aries when it is not (see wheelRotation).
 * The zodiac runs counter-clockwise: from the left axis, longitude grows towards 6 o'clock.
 */
export function eclipticToSvgAngle(
  eclipticDegree: number,
  rotation: number,
): number {
  return 180 + (eclipticDegree - rotation);
}

/**
 * Convert polar coordinates to Cartesian (SVG-space).
 * CRITICAL: Y is subtracted because SVG Y-axis is inverted.
 */
export function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleDeg: number,
): { x: number; y: number } {
  const rad = angleDeg * DEG_TO_RAD;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy - radius * Math.sin(rad),
  };
}

/**
 * Generate an SVG arc path string using the `A` command.
 * Sweep flag = 0 (counterclockwise).
 */
export function describeArc(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polarToCartesian(cx, cy, radius, startAngle);
  const end = polarToCartesian(cx, cy, radius, endAngle);
  const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;

  return [
    `M ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}`,
  ].join(" ");
}

/**
 * Generate an SVG sector (annular wedge) path.
 * Outer arc -> line to inner -> inner arc (reverse sweep) -> close.
 * Used for zodiac sign colored backgrounds.
 */
export function describeSector(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
): string {
  const outerStart = polarToCartesian(cx, cy, outerRadius, startAngle);
  const outerEnd = polarToCartesian(cx, cy, outerRadius, endAngle);
  const innerStart = polarToCartesian(cx, cy, innerRadius, startAngle);
  const innerEnd = polarToCartesian(cx, cy, innerRadius, endAngle);

  const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 0 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 1 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}
