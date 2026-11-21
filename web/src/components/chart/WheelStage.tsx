import type { CSSProperties, RefObject } from "react";
import { cn } from "@/lib/utils";
import type { Point2D } from "@astroweb/chart-core";
import type { SharedAspect } from "@/types";
import type { WheelModel } from "./wheelModel";
import WheelSvg from "./WheelSvg";
import ChartTooltip, { type TooltipTarget } from "./ChartTooltip";

export interface WheelFocus {
  target: TooltipTarget;
  /** Where the focused point is drawn, in SVG coordinates. */
  anchor: Point2D;
}

interface WheelStageProps {
  model: WheelModel;
  showSymbols: boolean;
  ariaLabel: string;
  revealed?: boolean;
  focusId: string | null;
  linked: Set<string> | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  /** The point whose tooltip is shown, or null. */
  focus: WheelFocus | null;
  /** The aspects drawn on the wheel; the tooltip lists those of the focused point. */
  aspects: SharedAspect[];
  svgRef: RefObject<SVGSVGElement | null>;
  className?: string;
  style?: CSSProperties;
}

/**
 * The wheel with its tooltip: the same picture on the profile page and in the maximised view. The tooltip is
 * placed from the `svg` it belongs to, so each stage keeps its own `svgRef`.
 */
export default function WheelStage({
  model,
  showSymbols,
  ariaLabel,
  revealed,
  focusId,
  linked,
  onHover,
  onSelect,
  focus,
  aspects,
  svgRef,
  className,
  style,
}: WheelStageProps) {
  return (
    <div className={cn("relative", className)} style={style}>
      <WheelSvg
        model={model}
        showSymbols={showSymbols}
        ariaLabel={ariaLabel}
        revealed={revealed}
        focusId={focusId}
        linked={linked}
        onHover={onHover}
        onSelect={onSelect}
        svgRef={svgRef}
        rootProps={{ className: "w-full h-auto" }}
      />

      {/* Tooltip overlay (HTML, outside SVG) */}
      {focus && (
        <ChartTooltip
          target={focus.target}
          aspects={aspects.filter((a) => a.a === focus.target.id || a.b === focus.target.id)}
          anchor={focus.anchor}
          svgRef={svgRef}
        />
      )}
    </div>
  );
}
