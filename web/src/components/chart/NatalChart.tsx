import { useEffect, useMemo, useRef, useState } from "react";
import { CHART_LAYOUT } from "./utils/constants";
import ZodiacRing from "./ZodiacRing";
import HouseCusps from "./HouseCusps";
import AspectLines from "./AspectLines";
import PlanetMarkers from "./PlanetMarkers";
import ChartTooltip from "./ChartTooltip";
import AspectFilters from "./AspectFilters";
import type { ChartResult } from "@/types";

export default function NatalChart({ chart }: { chart: ChartResult }) {
  const { size, cx, cy, outerRadius } = CHART_LAYOUT;
  const ascDegree = chart.houses.asc ?? 0;

  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredPlanet, setHoveredPlanet] = useState<string | null>(null);
  const [selectedPlanet, setSelectedPlanet] = useState<string | null>(null);
  // Hover wins while pointing; otherwise the tapped (selected) planet stays
  // focused — so the wheel is actionable on touch devices, not just on hover.
  const focusPlanet = hoveredPlanet ?? selectedPlanet;
  const [activeFilters, setActiveFilters] = useState<Set<string>>(
    new Set(["conjunction", "opposition", "trine", "square", "sextile"]),
  );
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    // Small delay before starting reveal animation (let DOM paint first)
    const timer = requestAnimationFrame(() => {
      setRevealed(true);
    });
    return () => cancelAnimationFrame(timer);
  }, []);

  const hoveredPlanetAspects = useMemo(() => {
    if (!focusPlanet) return null;
    return new Set(
      chart.aspects
        .filter((a) => a.a === focusPlanet || a.b === focusPlanet)
        .flatMap((a) => [a.a, a.b]),
    );
  }, [focusPlanet, chart.aspects]);

  const filteredAspects = useMemo(() => {
    return chart.aspects.filter((a) => activeFilters.has(a.type));
  }, [chart.aspects, activeFilters]);

  function toggleFilter(type: string) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  return (
    <div className="relative w-full max-w-[600px] mx-auto">
      <svg
        ref={svgRef}
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
          <filter id="glow-bright">
            <feGaussianBlur stdDeviation="5" result="blur" />
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
        <ZodiacRing ascDegree={ascDegree} revealed={revealed} />

        {/* House cusp lines */}
        <HouseCusps
          cusps={chart.houses.cusps}
          ascDegree={ascDegree}
          asc={chart.houses.asc}
          mc={chart.houses.mc}
          revealed={revealed}
        />

        {/* Aspect lines (inside wheel, behind planets) */}
        <AspectLines
          aspects={filteredAspects}
          points={chart.points}
          ascDegree={ascDegree}
          hoveredPlanet={focusPlanet}
          hoveredPlanetAspects={hoveredPlanetAspects}
          revealed={revealed}
        />

        {/* Planet markers (on top of aspect lines) */}
        <PlanetMarkers
          points={chart.points}
          ascDegree={ascDegree}
          hoveredPlanet={focusPlanet}
          hoveredPlanetAspects={hoveredPlanetAspects}
          onPlanetHover={setHoveredPlanet}
          onPlanetSelect={(body) =>
            setSelectedPlanet((prev) => (prev === body ? null : body))
          }
          revealed={revealed}
        />
      </svg>

      {/* Tooltip overlay (HTML, outside SVG) */}
      {focusPlanet && (
        <ChartTooltip
          planet={chart.points.find((p) => p.body === focusPlanet)!}
          aspects={chart.aspects.filter(
            (a) => a.a === focusPlanet || a.b === focusPlanet,
          )}
          svgRef={svgRef}
          ascDegree={ascDegree}
        />
      )}

      {/* Aspect type filter toggles */}
      <AspectFilters activeFilters={activeFilters} onToggle={toggleFilter} />
    </div>
  );
}
