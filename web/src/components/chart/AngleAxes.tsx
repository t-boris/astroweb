import { useMemo } from "react";
import {
  eclipticToSvgAngle,
  polarToCartesian,
  ANGLE_COLOR,
  CHART_LAYOUT,
  SIGN_ELEMENTS,
  angleEntries,
  angleLabelCenter,
  signGlyph,
} from "@astroweb/chart-core";
import { ELEMENT_COLORS } from "./utils/elementColors";
import type { ChartAngles } from "@/types";

interface AngleAxesProps {
  angles: ChartAngles;
  /** Longitude drawn on the left (9 o'clock) axis. */
  rotation: number;
  focusId: string | null;
  connectedIds: Set<string> | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  revealed: boolean;
}

/** Distance between the lines of an angle label (name, degree and sign, minute). */
const LABEL_LINE_STEP = 17;

/**
 * ASC, DSC, MC and IC as emphasized axes at their own calculated longitudes (independent of the
 * house cusps, so in Whole Sign the ASC is not on the left axis). Each axis carries its name, sign
 * glyph, degree and minute at the ring end.
 */
export default function AngleAxes({
  angles,
  rotation,
  focusId,
  connectedIds,
  onHover,
  onSelect,
  revealed,
}: AngleAxesProps) {
  const { cx, cy, houseInner, signInner, outerRadius } = CHART_LAYOUT;

  const axes = useMemo(
    () =>
      angleEntries(angles).map((entry) => {
        const svgAngle = eclipticToSvgAngle(entry.lon, rotation);
        return {
          ...entry,
          inner: polarToCartesian(cx, cy, houseInner, svgAngle),
          scaleEnd: polarToCartesian(cx, cy, signInner, svgAngle),
          ringEnd: polarToCartesian(cx, cy, outerRadius + 2, svgAngle),
          labelCenter: angleLabelCenter(svgAngle),
        };
      }),
    [angles, rotation, cx, cy, houseInner, signInner, outerRadius],
  );

  return (
    <g className="angle-axes" data-layer="angles">
      {axes.map((axis, index) => {
        const isHoverActive = focusId !== null;
        const opacity = isHoverActive ? (connectedIds?.has(axis.id) ? 1 : 0.25) : undefined;
        const style: React.CSSProperties = isHoverActive
          ? { opacity, cursor: "pointer" }
          : {
              animation: revealed
                ? `chart-fade-in 0.5s ease-out ${1.2 + index * 0.05}s forwards`
                : "none",
              opacity: revealed ? undefined : 0,
              cursor: "pointer",
            };
        const colors = ELEMENT_COLORS[SIGN_ELEMENTS[axis.sign]];

        return (
          <g
            key={axis.id}
            data-angle={axis.id}
            data-angle-lon={axis.lon.toFixed(4)}
            className="transition-opacity duration-200"
            style={style}
            onPointerEnter={() => onHover(axis.id)}
            onPointerLeave={() => onHover(null)}
            onClick={() => onSelect(axis.id)}
          >
            {/* Axis from the inner circle to the sign band, then a thin pointer across the band */}
            <line
              x1={axis.inner.x}
              y1={axis.inner.y}
              x2={axis.scaleEnd.x}
              y2={axis.scaleEnd.y}
              stroke={ANGLE_COLOR}
              strokeWidth={3.2}
              strokeLinecap="round"
            />
            <line
              x1={axis.scaleEnd.x}
              y1={axis.scaleEnd.y}
              x2={axis.ringEnd.x}
              y2={axis.ringEnd.y}
              stroke={ANGLE_COLOR}
              strokeWidth={1.2}
              strokeOpacity={0.6}
            />
            {/* Wider invisible stroke so the axis is easy to point at */}
            <line
              x1={axis.inner.x}
              y1={axis.inner.y}
              x2={axis.ringEnd.x}
              y2={axis.ringEnd.y}
              stroke="transparent"
              strokeWidth={16}
              pointerEvents="stroke"
            />

            {/* Label at the ring end: name, degree with sign glyph, minute */}
            <text
              data-field="name"
              x={axis.labelCenter.x}
              y={axis.labelCenter.y - LABEL_LINE_STEP}
              fontSize={15}
              fontWeight={700}
              textAnchor="middle"
              dominantBaseline="central"
              fill={ANGLE_COLOR}
            >
              {axis.label}
            </text>
            <text
              x={axis.labelCenter.x}
              y={axis.labelCenter.y}
              fontSize={15}
              textAnchor="middle"
              dominantBaseline="central"
              fill="rgba(255,255,255,0.9)"
            >
              <tspan data-field="degree">{`${axis.degree}°`}</tspan>
              <tspan data-field="sign" dx={2} fontSize={16} fill={colors.text}>
                {signGlyph(axis.sign)}
              </tspan>
            </text>
            <text
              data-field="minute"
              x={axis.labelCenter.x}
              y={axis.labelCenter.y + LABEL_LINE_STEP}
              fontSize={15}
              textAnchor="middle"
              dominantBaseline="central"
              fill="rgba(255,255,255,0.9)"
            >
              {`${String(axis.minute).padStart(2, "0")}′`}
            </text>
          </g>
        );
      })}
    </g>
  );
}
