import { CHART_LAYOUT } from "./utils/constants";
import ZodiacRing from "./ZodiacRing";
import HouseCusps from "./HouseCusps";
import AspectLines from "./AspectLines";
import PlanetMarkers from "./PlanetMarkers";
import type { ChartResult } from "@/types";

export default function NatalChart({ chart }: { chart: ChartResult }) {
  const { size, cx, cy, outerRadius } = CHART_LAYOUT;
  const ascDegree = chart.houses.asc ?? 0;

  return (
    <div className="relative w-full max-w-[600px] mx-auto">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-full h-auto"
        role="img"
        aria-label="Natal chart wheel"
      >
        {/* Dark cosmic background */}
        <defs>
          <radialGradient id="chart-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0f0f2e" />
            <stop offset="100%" stopColor="#070714" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="line-glow">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background circle */}
        <circle cx={cx} cy={cy} r={outerRadius + 20} fill="url(#chart-bg)" />

        {/* Zodiac ring */}
        <ZodiacRing ascDegree={ascDegree} />

        {/* House cusp lines */}
        <HouseCusps
          cusps={chart.houses.cusps}
          ascDegree={ascDegree}
          asc={chart.houses.asc}
          mc={chart.houses.mc}
        />

        {/* Aspect lines (inside wheel, behind planets) */}
        <AspectLines
          aspects={chart.aspects}
          points={chart.points}
          ascDegree={ascDegree}
        />

        {/* Planet markers (on top of aspect lines) */}
        <PlanetMarkers
          points={chart.points}
          ascDegree={ascDegree}
        />
      </svg>
    </div>
  );
}
