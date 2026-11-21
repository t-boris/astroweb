import { CHART_LAYOUT } from "@astroweb/chart-core";
import type { WheelModel } from "../wheelModel";
import WheelSvg from "../WheelSvg";
import { IMAGE_WHEEL_LOOK } from "../wheelLook";
import ImageFooter from "./ImageFooter";
import { IMAGE_BG, IMAGE_FONT, SVG_NS, WHEEL_IMAGE_MARGIN, WHEEL_IMAGE_SIZE } from "./imageCommon";

/** The wheel exactly as the page draws it (same component, nothing focused), on the page background, with the footer. */
export default function WheelImage({
  model,
  showSymbols,
  ariaLabel,
  footerLines,
}: {
  model: WheelModel;
  showSymbols: boolean;
  ariaLabel: string;
  footerLines: string[];
}) {
  const { width, height } = WHEEL_IMAGE_SIZE;
  return (
    <svg xmlns={SVG_NS} viewBox={`0 0 ${width} ${height}`} width={width} height={height} fontFamily={IMAGE_FONT}>
      <rect width={width} height={height} fill={IMAGE_BG} />
      <WheelSvg
        model={model}
        showSymbols={showSymbols}
        ariaLabel={ariaLabel}
        look={IMAGE_WHEEL_LOOK}
        rootProps={{
          x: WHEEL_IMAGE_MARGIN,
          y: WHEEL_IMAGE_MARGIN,
          width: CHART_LAYOUT.size,
          height: CHART_LAYOUT.size,
        }}
      />
      <ImageFooter width={width} y={CHART_LAYOUT.size + 2 * WHEEL_IMAGE_MARGIN} lines={footerLines} />
    </svg>
  );
}
