import { useMemo } from "react";
import { eclipticToSvgAngle, polarToCartesian, describeSector } from "./utils/chartMath";
import {
  ZODIAC_SIGNS,
  SIGN_ELEMENTS,
  ELEMENT_COLORS,
  CHART_LAYOUT,
} from "./utils/constants";
import { signGlyph } from "./utils/wheelLayout";

interface ZodiacRingProps {
  /** Longitude drawn on the left (9 o'clock) axis. */
  rotation: number;
  revealed: boolean;
}

/** The sign band: twelve sign sectors with their glyphs and the outer border. */
export default function ZodiacRing({ rotation, revealed }: ZodiacRingProps) {
  const { cx, cy, outerRadius, signInner } = CHART_LAYOUT;

  const sectors = useMemo(() => {
    return ZODIAC_SIGNS.map((sign, i) => {
      const startEcliptic = i * 30;
      const endEcliptic = (i + 1) * 30;

      const startAngle = eclipticToSvgAngle(startEcliptic, rotation);
      const endAngle = eclipticToSvgAngle(endEcliptic, rotation);

      const path = describeSector(cx, cy, signInner, outerRadius, startAngle, endAngle);

      const midAngle = eclipticToSvgAngle(startEcliptic + 15, rotation);
      const glyphPos = polarToCartesian(cx, cy, (outerRadius + signInner) / 2, midAngle);

      const element = SIGN_ELEMENTS[sign];
      const colors = ELEMENT_COLORS[element];

      return {
        sign,
        index: i,
        path,
        glyphPos,
        glyph: signGlyph(sign),
        colors,
      };
    });
  }, [rotation, cx, cy, outerRadius, signInner]);

  return (
    <g data-layer="zodiac-ring">
      {/* Sign sector wedges */}
      {sectors.map(({ sign, index, path, colors }) => (
        <path
          key={`sector-${sign}`}
          d={path}
          fill={colors.fill}
          stroke={colors.stroke}
          strokeOpacity={0.3}
          strokeWidth={1}
          style={{
            animation: revealed
              ? `chart-fade-in 0.6s ease-out ${0.3 + index * 0.05}s forwards`
              : "none",
            opacity: revealed ? undefined : 0,
          }}
        />
      ))}

      {/* Zodiac glyphs */}
      {sectors.map(({ sign, index, glyphPos, glyph, colors }) => (
        <text
          key={`glyph-${sign}`}
          data-sign={sign}
          x={glyphPos.x}
          y={glyphPos.y}
          fontSize={28}
          textAnchor="middle"
          dominantBaseline="central"
          fill={colors.text}
          style={{
            animation: revealed
              ? `chart-fade-in 0.6s ease-out ${0.5 + index * 0.05}s forwards`
              : "none",
            opacity: revealed ? undefined : 0,
          }}
        >
          {glyph}
        </text>
      ))}

      {/* Outer ring border */}
      <circle
        cx={cx}
        cy={cy}
        r={outerRadius}
        fill="none"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth={1.5}
        style={{
          animation: revealed
            ? "chart-shimmer 4s ease-in-out infinite, chart-fade-in 0.8s ease-out forwards"
            : "none",
          opacity: revealed ? undefined : 0,
        }}
      />
    </g>
  );
}
