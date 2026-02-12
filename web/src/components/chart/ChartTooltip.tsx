import { useEffect, useState, type RefObject } from "react";
import { eclipticToSvgAngle, polarToCartesian } from "./utils/chartMath";
import { PLANET_GLYPHS, ASPECT_GLYPHS, CHART_LAYOUT } from "./utils/constants";
import type { ChartPoint, ChartAspect } from "@/types";

interface ChartTooltipProps {
  planet: ChartPoint;
  aspects: ChartAspect[];
  svgRef: RefObject<SVGSVGElement | null>;
  ascDegree: number;
}

export default function ChartTooltip({
  planet,
  aspects,
  svgRef,
  ascDegree,
}: ChartTooltipProps) {
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

    const { cx, cy, planetRadius } = CHART_LAYOUT;
    const angle = eclipticToSvgAngle(planet.lon, ascDegree);
    const pos = polarToCartesian(cx, cy, planetRadius, angle);

    // Convert SVG coordinates to screen coordinates
    const pt = svg.createSVGPoint();
    pt.x = pos.x;
    pt.y = pos.y;
    const screenPt = pt.matrixTransform(ctm);

    // Get SVG bounding rect for relative positioning
    const svgRect = svg.getBoundingClientRect();

    const left = screenPt.x - svgRect.left;
    const top = screenPt.y - svgRect.top;

    // Determine if planet is on right half of chart
    const alignRight = pos.x > cx;

    setPosition({ left, top, alignRight });
  }, [planet, svgRef, ascDegree]);

  if (!position) return null;

  const glyph = PLANET_GLYPHS[planet.body] ?? "?";
  const wholeDeg = Math.floor(planet.degreeInSign);
  const arcMin = Math.round((planet.degreeInSign % 1) * 60);

  return (
    <div
      className="pointer-events-none absolute z-10 max-w-[220px] rounded-lg border border-white/10 bg-black/80 p-3 text-sm text-white backdrop-blur-sm"
      style={{
        left: position.left,
        top: position.top,
        transform: position.alignRight
          ? "translate(-100%, -50%) translate(-12px, 0)"
          : "translate(12px, -50%)",
      }}
    >
      {/* Planet name and glyph */}
      <div className="mb-1 font-semibold">
        {glyph} {planet.body}
      </div>

      {/* Sign + degree */}
      <div className="text-white/70">
        {wholeDeg}&deg;{arcMin < 10 ? `0${arcMin}` : arcMin}&apos; {planet.sign}
      </div>

      {/* House */}
      {planet.house !== null && (
        <div className="text-white/70">House {planet.house}</div>
      )}

      {/* Aspect summary (up to 5) */}
      {aspects.length > 0 && (
        <div className="mt-2 space-y-0.5 border-t border-white/10 pt-2">
          {aspects.slice(0, 5).map((asp) => {
            const otherBody =
              asp.a === planet.body ? asp.b : asp.a;
            const aspGlyph = ASPECT_GLYPHS[asp.type] ?? "";
            return (
              <div key={`${asp.a}-${asp.b}`} className="text-white/60">
                {aspGlyph}{" "}
                {asp.type.charAt(0).toUpperCase() + asp.type.slice(1)}{" "}
                {otherBody} ({asp.orb.toFixed(1)}&deg;)
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
