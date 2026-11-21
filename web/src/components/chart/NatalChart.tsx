import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { CHART_LAYOUT } from "./utils/constants";
import { eclipticToSvgAngle, polarToCartesian } from "./utils/chartMath";
import { filterAspects, useAspectFilters } from "./utils/aspectFilters";
import {
  getAngles,
  getPositions,
  getSharedAspects,
  isTimeEstimated,
  wheelRotation,
} from "./utils/positions";
import {
  angleEntries,
  aspectSegments,
  connectedIds,
  placePoints,
} from "./utils/wheelLayout";
import ZodiacRing from "./ZodiacRing";
import DegreeScale from "./DegreeScale";
import HouseCusps from "./HouseCusps";
import CuspLabels from "./CuspLabels";
import AspectLines from "./AspectLines";
import AngleAxes from "./AngleAxes";
import PlanetMarkers from "./PlanetMarkers";
import ChartTooltip, { type TooltipTarget } from "./ChartTooltip";
import AspectFilters from "./AspectFilters";
import type { ChartResult } from "@/types";

export default function NatalChart({ chart }: { chart: ChartResult }) {
  const { t } = useTranslation();
  const { size, cx, cy, planetRadius, houseInner } = CHART_LAYOUT;

  // Without a birth time the positions are local-noon estimates: no houses, no angles (REQ-001).
  const estimated = isTimeEstimated(chart);
  const rotation = wheelRotation(chart);
  const angles = estimated ? null : getAngles(chart);
  const cusps = estimated || chart.houses.cusps.length !== 12 ? null : chart.houses.cusps;

  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Hover wins while pointing; otherwise the tapped (selected) point stays
  // focused — so the wheel is actionable on touch devices, not just on hover.
  const focusId = hoveredId ?? selectedId;
  const { activeFilters, onToggle, onShowAll, onReset } = useAspectFilters();
  const [showSymbols, setShowSymbols] = useState(true);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    // Small delay before starting reveal animation (let DOM paint first)
    const timer = requestAnimationFrame(() => {
      setRevealed(true);
    });
    return () => cancelAnimationFrame(timer);
  }, []);

  const placed = useMemo(() => placePoints(getPositions(chart)), [chart]);

  // One shared aspect set; the filters only decide which of its aspects are drawn (DEC-011).
  const visibleAspects = useMemo(
    () => filterAspects(getSharedAspects(chart), activeFilters),
    [chart, activeFilters],
  );
  const segments = useMemo(
    () => aspectSegments(chart, visibleAspects, rotation),
    [chart, visibleAspects, rotation],
  );
  const linked = useMemo(() => connectedIds(focusId, visibleAspects), [focusId, visibleAspects]);

  const focus = useMemo(() => {
    if (focusId === null) return null;
    const point = placed.find((p) => p.id === focusId);
    if (point) {
      const target: TooltipTarget = {
        id: point.id,
        lon: point.lon,
        house: point.house,
        retrograde: point.retrograde,
      };
      const anchor = polarToCartesian(
        cx,
        cy,
        planetRadius,
        eclipticToSvgAngle(point.displayLon, rotation),
      );
      return { target, anchor };
    }
    const angle = angles ? angleEntries(angles).find((a) => a.id === focusId) : undefined;
    if (angle) {
      const target: TooltipTarget = { id: angle.id, lon: angle.lon, house: null, retrograde: false };
      const anchor = polarToCartesian(cx, cy, houseInner + 100, eclipticToSvgAngle(angle.lon, rotation));
      return { target, anchor };
    }
    return null;
  }, [focusId, placed, angles, rotation, cx, cy, planetRadius, houseInner]);

  function toggleSelected(id: string) {
    setSelectedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="relative w-full max-w-[600px] mx-auto">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${size} ${size}`}
        className="w-full h-auto"
        role="img"
        aria-label={t("natalWheel.ariaLabel")}
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

        {/* Background disc: the wheel and the angle labels around it */}
        <circle cx={cx} cy={cy} r={size / 2} fill="url(#chart-bg)" />

        {/* Sign band, then the graduated degree scale */}
        <ZodiacRing rotation={rotation} revealed={revealed} />
        <DegreeScale rotation={rotation} revealed={revealed} />

        {/* House cusps and numbers (none without a birth time), inner circle */}
        <HouseCusps cusps={cusps} rotation={rotation} revealed={revealed} />

        {/* Longitude of every house cusp outside the sign band (only with a birth time) */}
        {cusps && angles && (
          <CuspLabels cusps={cusps} angles={angles} rotation={rotation} revealed={revealed} />
        )}

        {/* Aspect lines (inside the inner circle, behind the points) */}
        <AspectLines
          segments={segments}
          focusId={focusId}
          showSymbols={showSymbols}
          revealed={revealed}
        />

        {/* ASC, DSC, MC, IC (only with a birth time) */}
        {angles && (
          <AngleAxes
            angles={angles}
            rotation={rotation}
            focusId={focusId}
            connectedIds={linked}
            onHover={setHoveredId}
            onSelect={toggleSelected}
            revealed={revealed}
          />
        )}

        {/* Points (on top of aspect lines) */}
        <PlanetMarkers
          points={placed}
          rotation={rotation}
          focusId={focusId}
          connectedIds={linked}
          onPointHover={setHoveredId}
          onPointSelect={toggleSelected}
          revealed={revealed}
        />
      </svg>

      {/* Tooltip overlay (HTML, outside SVG) */}
      {focus && (
        <ChartTooltip
          target={focus.target}
          aspects={visibleAspects.filter(
            (a) => a.a === focus.target.id || a.b === focus.target.id,
          )}
          anchor={focus.anchor}
          svgRef={svgRef}
        />
      )}

      {estimated && (
        <p role="note" data-wheel-note="time-estimated" className="mt-3 text-center text-xs text-amber-200/80">
          {t("natalWheel.timeEstimatedNote")}
        </p>
      )}

      {/* Aspect type filter toggles */}
      <AspectFilters
        activeFilters={activeFilters}
        onToggle={onToggle}
        onShowAll={onShowAll}
        onReset={onReset}
      />

      {/* Display option, not a filter: the aspect glyph at the middle of each line */}
      <div className="mt-3 flex justify-center">
        <button
          type="button"
          aria-pressed={showSymbols}
          onClick={() => setShowSymbols((value) => !value)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-medium text-white/80 transition-all duration-200",
            showSymbols ? "border-white/40" : "border-white/10 opacity-50",
          )}
        >
          {t("natalWheel.aspectSymbols")}
        </button>
      </div>
    </div>
  );
}
