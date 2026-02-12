import { useMemo } from "react";
import { eclipticToSvgAngle, polarToCartesian, describeSector } from "./utils/chartMath";
import {
  ZODIAC_SIGNS,
  ZODIAC_GLYPHS,
  SIGN_ELEMENTS,
  ELEMENT_COLORS,
  CHART_LAYOUT,
} from "./utils/constants";

interface ZodiacRingProps {
  ascDegree: number;
}

export default function ZodiacRing({ ascDegree }: ZodiacRingProps) {
  const { cx, cy, outerRadius, zodiacInner } = CHART_LAYOUT;

  const sectors = useMemo(() => {
    return ZODIAC_SIGNS.map((sign, i) => {
      const startEcliptic = i * 30;
      const endEcliptic = (i + 1) * 30;

      const startAngle = eclipticToSvgAngle(startEcliptic, ascDegree);
      const endAngle = eclipticToSvgAngle(endEcliptic, ascDegree);

      const path = describeSector(cx, cy, zodiacInner, outerRadius, startAngle, endAngle);

      const midAngle = eclipticToSvgAngle(startEcliptic + 15, ascDegree);
      const glyphPos = polarToCartesian(cx, cy, (outerRadius + zodiacInner) / 2, midAngle);

      const element = SIGN_ELEMENTS[sign];
      const colors = ELEMENT_COLORS[element];

      return {
        sign,
        path,
        glyphPos,
        glyph: ZODIAC_GLYPHS[sign],
        colors,
      };
    });
  }, [ascDegree, cx, cy, outerRadius, zodiacInner]);

  return (
    <g>
      {/* Sign sector wedges */}
      {sectors.map(({ sign, path, colors }) => (
        <path
          key={`sector-${sign}`}
          d={path}
          fill={colors.fill}
          stroke={colors.stroke}
          strokeOpacity={0.3}
          strokeWidth={1}
        />
      ))}

      {/* Zodiac glyphs */}
      {sectors.map(({ sign, glyphPos, glyph, colors }) => (
        <text
          key={`glyph-${sign}`}
          x={glyphPos.x}
          y={glyphPos.y}
          fontSize={28}
          textAnchor="middle"
          dominantBaseline="central"
          fill={colors.text}
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
      />
    </g>
  );
}
