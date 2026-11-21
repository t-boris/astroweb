import { useMemo } from "react";
import { eclipticToSvgAngle, polarToCartesian } from "./utils/chartMath";
import { CHART_LAYOUT, ELEMENT_COLORS, SIGN_ELEMENTS } from "./utils/constants";
import { CUSP_LABEL_START_RADIUS, cuspLabelCenter, cuspLabels, signGlyph } from "./utils/wheelLayout";
import type { ChartAngles } from "@/types";

interface CuspLabelsProps {
  /** The twelve cusp longitudes, house 1 first. */
  cusps: readonly number[];
  angles: ChartAngles;
  /** Longitude drawn on the left (9 o'clock) axis. */
  rotation: number;
  revealed: boolean;
}

/** Distance between the two lines of a cusp label (degree and sign, minute). */
const LABEL_LINE_STEP = 15;

/** Length of the mark outside the sign band that shows the exact cusp longitude. */
const MARK_LENGTH = 4;

/**
 * The longitude of every house cusp outside the sign band, in the same form as the angle labels (degree,
 * sign glyph, minute) but smaller and dimmer: the cusp line is carried across the sign band, and the
 * label sits on it. A cusp that coincides with an angle is left to that angle's label. A label that had
 * to make room for a neighbour is joined to its cusp by a short dashed leader. Drawn only with a
 * birth time.
 */
export default function CuspLabels({ cusps, angles, rotation, revealed }: CuspLabelsProps) {
  const { cx, cy, zodiacInner, outerRadius } = CHART_LAYOUT;

  const labels = useMemo(
    () =>
      cuspLabels(cusps, angles).map((entry) => {
        const exact = eclipticToSvgAngle(entry.lon, rotation);
        const shown = eclipticToSvgAngle(entry.displayLon, rotation);
        return {
          ...entry,
          lineStart: polarToCartesian(cx, cy, zodiacInner, exact),
          markEnd: polarToCartesian(cx, cy, outerRadius + MARK_LENGTH, exact),
          leaderEnd: polarToCartesian(cx, cy, CUSP_LABEL_START_RADIUS, shown),
          center: cuspLabelCenter(shown),
        };
      }),
    [cusps, angles, rotation, cx, cy, zodiacInner, outerRadius],
  );

  return (
    <g data-layer="cusp-labels" pointerEvents="none">
      {labels.map((label, index) => {
        const colors = ELEMENT_COLORS[SIGN_ELEMENTS[label.sign]];
        return (
          <g
            key={label.house}
            data-cusp-label={label.house}
            data-cusp-lon={label.lon.toFixed(4)}
            data-displaced={label.displaced}
            style={{
              animation: revealed ? `chart-fade-in 0.4s ease-out ${1.1 + index * 0.03}s forwards` : "none",
              opacity: revealed ? undefined : 0,
            }}
          >
            {/* The cusp line carried across the sign band, with a mark at the exact longitude */}
            <line
              data-cusp-extension
              x1={label.lineStart.x}
              y1={label.lineStart.y}
              x2={label.markEnd.x}
              y2={label.markEnd.y}
              stroke="rgba(255, 255, 255, 0.22)"
              strokeWidth={1}
            />
            {label.displaced && (
              <line
                data-leader
                x1={label.markEnd.x}
                y1={label.markEnd.y}
                x2={label.leaderEnd.x}
                y2={label.leaderEnd.y}
                stroke="rgba(255, 255, 255, 0.4)"
                strokeWidth={0.8}
                strokeDasharray="2 2"
              />
            )}
            <text
              x={label.center.x}
              y={label.center.y - LABEL_LINE_STEP / 2}
              fontSize={13}
              textAnchor="middle"
              dominantBaseline="central"
              fill="rgba(255,255,255,0.65)"
            >
              <tspan data-field="degree">{`${label.degree}°`}</tspan>
              <tspan data-field="sign" dx={2} fontSize={14} fill={colors.text} fillOpacity={0.85}>
                {signGlyph(label.sign)}
              </tspan>
            </text>
            <text
              data-field="minute"
              x={label.center.x}
              y={label.center.y + LABEL_LINE_STEP / 2}
              fontSize={13}
              textAnchor="middle"
              dominantBaseline="central"
              fill="rgba(255,255,255,0.65)"
            >
              {`${String(label.minute).padStart(2, "0")}′`}
            </text>
          </g>
        );
      })}
    </g>
  );
}
