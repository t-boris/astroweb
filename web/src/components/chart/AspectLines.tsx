import { useMemo } from "react";
import { eclipticToSvgAngle, polarToCartesian } from "./utils/chartMath";
import { ASPECT_COLORS, CHART_LAYOUT } from "./utils/constants";
import type { ChartAspect, ChartPoint } from "@/types";

interface AspectLinesProps {
  aspects: ChartAspect[];
  points: ChartPoint[];
  ascDegree: number;
}

export default function AspectLines({ aspects, points, ascDegree }: AspectLinesProps) {
  const { cx, cy, aspectRadius } = CHART_LAYOUT;

  const lines = useMemo(() => {
    // Build lookup map for body -> ecliptic longitude
    const bodyToLon: Record<string, number> = {};
    for (const p of points) {
      bodyToLon[p.body] = p.lon;
    }

    return aspects
      .map((aspect) => {
        const lonA = bodyToLon[aspect.a];
        const lonB = bodyToLon[aspect.b];
        if (lonA === undefined || lonB === undefined) return null;

        const angleA = eclipticToSvgAngle(lonA, ascDegree);
        const angleB = eclipticToSvgAngle(lonB, ascDegree);

        const posA = polarToCartesian(cx, cy, aspectRadius, angleA);
        const posB = polarToCartesian(cx, cy, aspectRadius, angleB);

        return {
          key: `${aspect.a}-${aspect.b}-${aspect.type}`,
          x1: posA.x,
          y1: posA.y,
          x2: posB.x,
          y2: posB.y,
          stroke: ASPECT_COLORS[aspect.type] ?? "#ffffff",
          strokeWidth: 1 + aspect.exactness,
          strokeOpacity: 0.3 + aspect.exactness * 0.4,
          type: aspect.type,
          a: aspect.a,
          b: aspect.b,
        };
      })
      .filter((line): line is NonNullable<typeof line> => line !== null);
  }, [aspects, points, ascDegree, cx, cy, aspectRadius]);

  return (
    <g className="aspect-lines">
      {lines.map((line) => (
        <line
          key={line.key}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke={line.stroke}
          strokeWidth={line.strokeWidth}
          strokeOpacity={line.strokeOpacity}
          filter="url(#line-glow)"
          data-aspect-type={line.type}
          data-aspect-a={line.a}
          data-aspect-b={line.b}
        />
      ))}
    </g>
  );
}
