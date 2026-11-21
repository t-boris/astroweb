import { useEffect, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { signLabel } from "@/lib/signs";
import {
  CHART_LAYOUT,
  ASPECT_GLYPHS,
  formatDegreeMinute,
  splitLongitude,
  formatSignedOrb,
  type Point2D,
  pointGlyph,
} from "@astroweb/chart-core";
import { pointLabel } from "./utils/labels";
import type { SharedAspect } from "@/types";

export interface TooltipTarget {
  /** A position id, or one of ASC, DSC, MC, IC. */
  id: string;
  lon: number;
  /** Null for the angles and when the birth time is unknown. */
  house: number | null;
  retrograde: boolean;
}

interface ChartTooltipProps {
  target: TooltipTarget;
  /** The aspects of the target that are drawn on the wheel (the filters apply). */
  aspects: SharedAspect[];
  /** Where the target is drawn, in SVG coordinates. */
  anchor: Point2D;
  svgRef: RefObject<SVGSVGElement | null>;
}

/** The longest aspect list the tooltip shows; the rest is summarised. */
const MAX_ASPECT_ROWS = 12;

/** What the tooltip says about a point or angle: position, house, retrograde and its drawn aspects. */
export function ChartTooltipContent({ target, aspects }: { target: TooltipTarget; aspects: SharedAspect[] }) {
  const { t } = useTranslation();
  const { sign } = splitLongitude(target.lon);
  const shown = [...aspects].sort((a, b) => a.orb - b.orb).slice(0, MAX_ASPECT_ROWS);
  const hidden = aspects.length - shown.length;

  return (
    <>
      {/* Name and glyph */}
      <div className="mb-1 font-semibold">
        {pointGlyph(target.id)} {pointLabel(t, target.id)}
        {target.retrograde && (
          <span className="ml-2 text-xs font-normal text-red-300">
            {t("natalChart.positions.retrograde")}
          </span>
        )}
      </div>

      {/* Degree, minute and sign */}
      <div className="text-white/70">
        {formatDegreeMinute(target.lon)} {signLabel(t, sign)}
      </div>

      {/* House */}
      {target.house !== null && (
        <div className="text-white/70">
          {t("tables.planets.house")} {target.house}
        </div>
      )}

      {/* Aspects of this point: orb, and applying or separating where the shared set says so */}
      {shown.length > 0 && (
        <div className="mt-2 space-y-0.5 border-t border-white/10 pt-2">
          {shown.map((asp) => {
            const other = asp.a === target.id ? asp.b : asp.a;
            const motion =
              asp.applying === null
                ? null
                : asp.applying
                  ? t("natalChart.aspects.applying").toLowerCase()
                  : t("natalChart.aspects.separating").toLowerCase();
            return (
              <div key={`${asp.a}-${asp.b}-${asp.type}`} className="text-white/60">
                {ASPECT_GLYPHS[asp.type] ?? ""} {t(`chart.aspects.${asp.type}`, asp.type)} {pointLabel(t, other)} (
                {formatSignedOrb(asp)}
                {motion ? `, ${motion}` : ""})
              </div>
            );
          })}
          {hidden > 0 && (
            <div className="text-white/40">{t("natalWheel.tooltip.more", { count: hidden })}</div>
          )}
        </div>
      )}
    </>
  );
}

export default function ChartTooltip({ target, aspects, anchor, svgRef }: ChartTooltipProps) {
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    alignRight: boolean;
  } | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const ctm = svg.getScreenCTM();
    if (!ctm) return;

    // Convert SVG coordinates to screen coordinates
    const pt = svg.createSVGPoint();
    pt.x = anchor.x;
    pt.y = anchor.y;
    const screenPt = pt.matrixTransform(ctm);

    // Get SVG bounding rect for relative positioning
    const svgRect = svg.getBoundingClientRect();

    setPosition({
      left: screenPt.x - svgRect.left,
      top: screenPt.y - svgRect.top,
      // Right half of the chart: open the tooltip towards the left
      alignRight: anchor.x > CHART_LAYOUT.cx,
    });
  }, [anchor, svgRef]);

  if (!position) return null;

  return (
    <div
      className="pointer-events-none absolute z-10 max-w-[240px] rounded-lg border border-white/10 bg-black/80 p-3 text-sm text-white backdrop-blur-sm"
      style={{
        left: position.left,
        top: position.top,
        transform: position.alignRight
          ? "translate(-100%, -50%) translate(-12px, 0)"
          : "translate(12px, -50%)",
      }}
    >
      <ChartTooltipContent target={target} aspects={aspects} />
    </div>
  );
}
