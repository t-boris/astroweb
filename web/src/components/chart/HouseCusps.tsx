import { useMemo } from "react";
import { eclipticToSvgAngle, polarToCartesian, CHART_LAYOUT, houseMidLongitude } from "@astroweb/chart-core";
import { PAGE_WHEEL_LOOK, type WheelLook } from "./wheelLook";

interface HouseCuspsProps {
  /** The twelve cusp longitudes, house 1 first. Null when the birth time is unknown: no houses are drawn. */
  cusps: readonly number[] | null;
  /** Longitude drawn on the left (9 o'clock) axis. */
  rotation: number;
  revealed: boolean;
  look?: WheelLook;
}

/**
 * The houses: a thin line at every calculated cusp, the house number ring and the number of each house
 * between its two cusps (the cusps need not be 30 degrees apart). The inner circle is always drawn;
 * without a birth time it is the only thing this layer draws.
 */
export default function HouseCusps({ cusps, rotation, revealed, look = PAGE_WHEEL_LOOK }: HouseCuspsProps) {
  const { cx, cy, houseOuter, houseInner, houseRingOuter, houseNumberRadius } = CHART_LAYOUT;

  const lines = useMemo(() => {
    if (!cusps) return [];
    return cusps.map((cusp, i) => {
      const angle = eclipticToSvgAngle(cusp, rotation);
      return {
        index: i,
        outer: polarToCartesian(cx, cy, houseOuter, angle),
        inner: polarToCartesian(cx, cy, houseInner, angle),
      };
    });
  }, [cusps, rotation, cx, cy, houseOuter, houseInner]);

  const numbers = useMemo(() => {
    if (!cusps) return [];
    return cusps.map((_, i) => {
      const midAngle = eclipticToSvgAngle(houseMidLongitude(cusps, i), rotation);
      return {
        index: i,
        houseNumber: i + 1,
        pos: polarToCartesian(cx, cy, houseNumberRadius, midAngle),
      };
    });
  }, [cusps, rotation, cx, cy, houseNumberRadius]);

  return (
    <g data-layer="houses">
      {/* House number ring */}
      {cusps && (
        <circle
          cx={cx}
          cy={cy}
          r={houseRingOuter}
          fill={look.houseRingFill}
          stroke={look.houseRingStroke}
          strokeWidth={1}
          style={{
            animation: revealed ? "chart-fade-in 0.4s ease-out 1.0s forwards" : "none",
            opacity: revealed ? undefined : 0,
          }}
        />
      )}

      {/* House cusp lines */}
      {lines.map(({ index, outer, inner }) => (
        <line
          key={`cusp-${index}`}
          data-house-cusp={index + 1}
          x1={outer.x}
          y1={outer.y}
          x2={inner.x}
          y2={inner.y}
          stroke={look.cuspStroke}
          strokeWidth={look.cuspWidth}
          style={{
            animation: revealed
              ? `chart-fade-in 0.4s ease-out ${1.0 + index * 0.03}s forwards`
              : "none",
            opacity: revealed ? undefined : 0,
          }}
        />
      ))}

      {/* House numbers */}
      {numbers.map(({ index, houseNumber, pos }) => (
        <text
          key={`house-num-${index}`}
          data-house-number={houseNumber}
          x={pos.x}
          y={pos.y}
          fontSize={15}
          fill="rgba(255,255,255,0.55)"
          textAnchor="middle"
          dominantBaseline="central"
          style={{
            animation: revealed
              ? `chart-fade-in 0.4s ease-out ${1.05 + index * 0.03}s forwards`
              : "none",
            opacity: revealed ? undefined : 0,
          }}
        >
          {houseNumber}
        </text>
      ))}

      {/* Inner circle boundary: the aspect lines end on it */}
      <circle
        cx={cx}
        cy={cy}
        r={houseInner}
        fill="none"
        stroke={look.innerCircleStroke}
        strokeWidth={1}
        style={{
          animation: revealed
            ? "chart-fade-in 0.4s ease-out 1.0s forwards"
            : "none",
          opacity: revealed ? undefined : 0,
        }}
      />
    </g>
  );
}
