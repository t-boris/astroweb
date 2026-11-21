import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CHART_LAYOUT,
  eclipticToSvgAngle,
  polarToCartesian,
  angleEntries,
  connectedIds,
} from "@astroweb/chart-core";
import { useAspectFilters } from "./utils/useAspectFilters";
import { buildWheelModel } from "./wheelModel";
import WheelStage, { type WheelFocus } from "./WheelStage";
import MaximizedWheel, { MAXIMIZED_WHEEL_SIZE } from "./MaximizedWheel";
import type { TooltipTarget } from "./ChartTooltip";
import { clickReleasesPinned, keyReleasesPinned } from "./wheelSelection";
import AspectFilters from "./AspectFilters";
import { ImageDownloadButton } from "./image/ImageDownloadButton";
import { buildWheelImage } from "./image/buildImages";
import { composeFooterLines, type ChartImageContext } from "./image/imageCommon";
import type { ChartResult } from "@/types";

interface NatalChartProps {
  chart: ChartResult;
  /** Birth data for the footer of the downloaded image; without it the download button is not shown. */
  imageContext?: ChartImageContext;
}

export default function NatalChart({ chart, imageContext }: NatalChartProps) {
  const { t, i18n } = useTranslation();
  const { cx, cy, planetRadius, houseInner } = CHART_LAYOUT;

  const svgRef = useRef<SVGSVGElement>(null);
  const maximizedSvgRef = useRef<SVGSVGElement>(null);
  const [maximized, setMaximized] = useState(false);
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

  // Everything the wheel draws; the image export builds the same model (see wheelModel.ts).
  const model = useMemo(() => buildWheelModel(chart, activeFilters), [chart, activeFilters]);
  const { estimated, rotation, angles, placed, visibleAspects } = model;
  const linked = useMemo(() => connectedIds(focusId, visibleAspects), [focusId, visibleAspects]);

  const focus = useMemo<WheelFocus | null>(() => {
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

  // A pinned point stays until it is let go: a click anywhere else, or Escape. (A click on a point or axis keeps
  // its own rule: it pins that one, and a second click on the same one unpins it.)
  const pinned = selectedId !== null;
  useEffect(() => {
    if (!pinned) return;
    const onClick = (event: MouseEvent) => {
      if (clickReleasesPinned(event.target, [svgRef.current, maximizedSvgRef.current])) setSelectedId(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (keyReleasesPinned(event.key)) setSelectedId(null);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pinned]);

  return (
    <div className="relative w-full">
      {/* The wheel over the whole window: in the top right corner of the chart area, not of the centred wheel */}
      <button
        type="button"
        onClick={() => setMaximized(true)}
        aria-label={t("natalWheel.maximize")}
        title={t("natalWheel.maximize")}
        data-wheel-maximize
        className="absolute right-0 top-0 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white/80 backdrop-blur-sm transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8fb6ff]"
      >
        <Maximize2 className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="relative mx-auto w-full max-w-[600px]">
        <WheelStage
          model={model}
          showSymbols={showSymbols}
          ariaLabel={t("natalWheel.ariaLabel")}
          revealed={revealed}
          focusId={focusId}
          linked={linked}
          onHover={setHoveredId}
          onSelect={toggleSelected}
          focus={focus}
          aspects={visibleAspects}
          svgRef={svgRef}
        />

        <MaximizedWheel
          open={maximized}
          onClose={() => {
            setMaximized(false);
            // The wheel in the dialog is removed under the pointer, so its own "pointer left" never arrives.
            setHoveredId(null);
          }}
          label={t("natalWheel.maximizedLabel")}
          closeLabel={t("natalWheel.closeMaximized")}
        >
          <WheelStage
            model={model}
            showSymbols={showSymbols}
            ariaLabel={t("natalWheel.ariaLabel")}
            focusId={focusId}
            linked={linked}
            onHover={setHoveredId}
            onSelect={toggleSelected}
            focus={focus}
            aspects={visibleAspects}
            svgRef={maximizedSvgRef}
            style={{ width: MAXIMIZED_WHEEL_SIZE }}
          />
        </MaximizedWheel>

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

        {/* Display option, not a filter: the aspect glyph at the middle of each line; then the image download */}
        <div className="mt-3 flex flex-wrap items-start justify-center gap-2">
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
          {imageContext && (
            <ImageDownloadButton
              kind="wheel"
              build={() =>
                buildWheelImage({
                  chart,
                  activeFilters,
                  showSymbols,
                  ariaLabel: t("natalWheel.ariaLabel"),
                  footerLines: composeFooterLines(t, i18n.language, chart, imageContext),
                })
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
