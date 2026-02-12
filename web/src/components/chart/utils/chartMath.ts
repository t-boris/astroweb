/** Pure math utilities for chart coordinate conversion — no React dependency. */

export const DEG_TO_RAD = Math.PI / 180;

/**
 * Convert ecliptic longitude to SVG angle.
 * Places the Ascendant at the 9-o'clock position (180 deg in SVG space).
 */
export function eclipticToSvgAngle(
  eclipticDegree: number,
  ascDegree: number,
): number {
  return 180 - (eclipticDegree - ascDegree);
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
