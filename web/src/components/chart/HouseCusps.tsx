import { useMemo } from "react";
import { eclipticToSvgAngle, polarToCartesian } from "./utils/chartMath";
import { CHART_LAYOUT } from "./utils/constants";

interface HouseCuspsProps {
  cusps: number[];
  ascDegree: number;
  asc: number | null;
  mc: number | null;
  revealed: boolean;
}

export default function HouseCusps({ cusps, ascDegree, asc, mc, revealed }: HouseCuspsProps) {
  const { cx, cy, houseOuter, houseInner } = CHART_LAYOUT;

  const lines = useMemo(() => {
    return cusps.map((cusp, i) => {
      const angle = eclipticToSvgAngle(cusp, ascDegree);
      const outer = polarToCartesian(cx, cy, houseOuter, angle);
      const inner = polarToCartesian(cx, cy, houseInner, angle);

      // ASC = cusp index 0, MC = cusp index 9
      const isAsc = i === 0 && asc !== null;
      const isMc = i === 9 && mc !== null;
      const emphasized = isAsc || isMc;

      return {
        index: i,
        outer,
        inner,
        stroke: emphasized ? "rgba(255, 255, 255, 0.5)" : "rgba(255, 255, 255, 0.2)",
        strokeWidth: emphasized ? 2 : 1,
      };
    });
  }, [cusps, ascDegree, asc, mc, cx, cy, houseOuter, houseInner]);

  const numbers = useMemo(() => {
    return cusps.map((cusp, i) => {
      const nextCusp = cusps[(i + 1) % 12];
      let start = cusp;
      let end = nextCusp;

      // Handle 0/360 wrap
      if (end < start) {
        end += 360;
      }

      const midEcliptic = (start + end) / 2;
      const midAngle = eclipticToSvgAngle(midEcliptic, ascDegree);
      const pos = polarToCartesian(cx, cy, houseInner + 30, midAngle);

      return {
        index: i,
        houseNumber: i + 1,
        pos,
      };
    });
  }, [cusps, ascDegree, cx, cy, houseInner]);

  return (
    <g>
      {/* House cusp lines */}
      {lines.map(({ index, outer, inner, stroke, strokeWidth }) => (
        <line
          key={`cusp-${index}`}
          x1={outer.x}
          y1={outer.y}
          x2={inner.x}
          y2={inner.y}
          stroke={stroke}
          strokeWidth={strokeWidth}
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
          x={pos.x}
          y={pos.y}
          fontSize={14}
          fill="rgba(255,255,255,0.4)"
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

      {/* Inner circle boundary */}
      <circle
        cx={cx}
        cy={cy}
        r={houseInner}
        fill="none"
        stroke="rgba(255,255,255,0.1)"
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
