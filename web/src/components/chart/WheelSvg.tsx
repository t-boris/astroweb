import type { Ref, SVGProps } from "react";
import { CHART_LAYOUT } from "@astroweb/chart-core";
import type { WheelModel } from "./wheelModel";
import ZodiacRing from "./ZodiacRing";
import DegreeScale from "./DegreeScale";
import HouseCusps from "./HouseCusps";
import CuspLabels from "./CuspLabels";
import AspectLines from "./AspectLines";
import AngleAxes from "./AngleAxes";
import PlanetMarkers from "./PlanetMarkers";
import { PAGE_WHEEL_LOOK, type WheelLook } from "./wheelLook";

const NO_HOVER = () => {};
const NO_SELECT = () => {};

export interface WheelSvgProps {
  model: WheelModel;
  /** The aspect glyph at the middle of each line. */
  showSymbols: boolean;
  ariaLabel: string;
  /** False draws the layers in their pre-reveal state (the profile page flips it after the first paint). */
  revealed?: boolean;
  /** Point or angle kept in focus by the page (hover or tap); the image export leaves it empty. */
  focusId?: string | null;
  /** Ids joined by an aspect to the focused one. */
  linked?: Set<string> | null;
  onHover?: (id: string | null) => void;
  onSelect?: (id: string) => void;
  svgRef?: Ref<SVGSVGElement>;
  /** Extra attributes of the root `svg` (class, or position and size when nested in the export). */
  rootProps?: SVGProps<SVGSVGElement>;
  /** Disc colours and dividing-line strength; the page default, a stronger set for the downloaded image. */
  look?: WheelLook;
}

/**
 * The natal wheel as one SVG: background disc, sign band, degree scale, house cusps and labels, aspect lines,
 * angle axes and points. It holds no state; the page owns hover, selection and the filters, and the image
 * export renders the same component with an empty focus, so both draw identical wheels.
 */
export default function WheelSvg({
  model,
  showSymbols,
  ariaLabel,
  revealed = true,
  focusId = null,
  linked = null,
  onHover = NO_HOVER,
  onSelect = NO_SELECT,
  svgRef,
  rootProps,
  look = PAGE_WHEEL_LOOK,
}: WheelSvgProps) {
  const { size, cx, cy } = CHART_LAYOUT;
  const { rotation, angles, cusps, placed, segments } = model;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${size} ${size}`}
      {...rootProps}
      role="img"
      aria-label={ariaLabel}
    >
      {/* Dark cosmic background */}
      <defs>
        <radialGradient id="chart-bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={look.discCenter} />
          <stop offset="100%" stopColor={look.discEdge} />
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
      <ZodiacRing rotation={rotation} revealed={revealed} look={look} />
      <DegreeScale rotation={rotation} revealed={revealed} />

      {/* House cusps and numbers (none without a birth time), inner circle */}
      <HouseCusps cusps={cusps} rotation={rotation} revealed={revealed} look={look} />

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
          onHover={onHover}
          onSelect={onSelect}
          revealed={revealed}
        />
      )}

      {/* Points (on top of aspect lines) */}
      <PlanetMarkers
        points={placed}
        rotation={rotation}
        focusId={focusId}
        connectedIds={linked}
        onPointHover={onHover}
        onPointSelect={onSelect}
        revealed={revealed}
      />
    </svg>
  );
}
