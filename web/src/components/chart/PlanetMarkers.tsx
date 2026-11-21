import { useMemo } from "react";
import {
  eclipticToSvgAngle,
  polarToCartesian,
  CHART_LAYOUT,
  POINT_LABEL_RADII,
  SIGN_ELEMENTS,
  signGlyph,
  type PlacedPoint,
} from "@astroweb/chart-core";
import { ELEMENT_COLORS } from "./utils/elementColors";

interface PlanetMarkersProps {
  points: PlacedPoint[];
  /** Longitude drawn on the left (9 o'clock) axis. */
  rotation: number;
  focusId: string | null;
  connectedIds: Set<string> | null;
  onPointHover: (id: string | null) => void;
  onPointSelect?: (id: string) => void;
  revealed: boolean;
}

/** Length of the short tick on the degree scale and on the inner circle that marks the exact longitude. */
const RING_TICK = 9;
const INNER_TICK = 7;
/** Half the height of a glyph: where the leader line meets the glyph. */
const GLYPH_HALF = 16;
/** Distance of the retrograde "R" from the glyph centre, along the circle (neighbours are at least a label gap away). */
const RETROGRADE_OFFSET = 21;
const RAD_TO_DEG = 180 / Math.PI;

const POINT_COLOR = "#dfeaff";
const TICK_COLOR = "rgba(143, 182, 255, 0.95)";

/**
 * Every plotted point: its glyph with degree, sign glyph and minute, an "R" when retrograde, a tick
 * at the exact longitude on the degree scale (and on the inner circle) and a leader line from that
 * tick to the label. The labels may stand apart from the exact longitude where points are crowded
 * (chart-core labelSpread); the leader keeps them tied to it.
 */
export default function PlanetMarkers({
  points,
  rotation,
  focusId,
  connectedIds,
  onPointHover,
  onPointSelect,
  revealed,
}: PlanetMarkersProps) {
  const { cx, cy, zodiacInner, houseInner } = CHART_LAYOUT;

  const geometry = useMemo(
    () =>
      points.map((point) => {
        const exactAngle = eclipticToSvgAngle(point.lon, rotation);
        const labelAngle = eclipticToSvgAngle(point.displayLon, rotation);
        return {
          point,
          ringTickStart: polarToCartesian(cx, cy, zodiacInner, exactAngle),
          ringTickEnd: polarToCartesian(cx, cy, zodiacInner - RING_TICK, exactAngle),
          innerTickStart: polarToCartesian(cx, cy, houseInner, exactAngle),
          innerTickEnd: polarToCartesian(cx, cy, houseInner + INNER_TICK, exactAngle),
          leaderEnd: polarToCartesian(cx, cy, POINT_LABEL_RADII.glyph + GLYPH_HALF, labelAngle),
          glyph: polarToCartesian(cx, cy, POINT_LABEL_RADII.glyph, labelAngle),
          // Beside the glyph, in the direction of increasing longitude: the label stack runs radially
          // inwards, so any other side may collide with it.
          retrograde: polarToCartesian(
            cx,
            cy,
            POINT_LABEL_RADII.glyph,
            labelAngle + (RETROGRADE_OFFSET / POINT_LABEL_RADII.glyph) * RAD_TO_DEG,
          ),
          degree: polarToCartesian(cx, cy, POINT_LABEL_RADII.degree, labelAngle),
          sign: polarToCartesian(cx, cy, POINT_LABEL_RADII.sign, labelAngle),
          minute: polarToCartesian(cx, cy, POINT_LABEL_RADII.minute, labelAngle),
        };
      }),
    [points, rotation, cx, cy, zodiacInner, houseInner],
  );

  return (
    <g className="planet-markers" data-layer="points">
      {geometry.map((g, index) => {
        const { point } = g;
        const isHoverActive = focusId !== null;
        const isFocused = point.id === focusId;
        const signColor = ELEMENT_COLORS[SIGN_ELEMENTS[point.sign]].text;
        // Long glyph text such as "Vx" must fit the same space as a single glyph.
        const glyphSize = point.glyph.length > 1 ? 19 : 28;

        // Hover opacity logic — when hover is active, skip animation styles
        let opacity: number | undefined;
        if (isHoverActive) {
          opacity = isFocused || connectedIds?.has(point.id) ? 1 : 0.15;
        } else if (!revealed) {
          opacity = 0;
        }

        // Animation style — only when hover is not active
        const animationStyle: React.CSSProperties = isHoverActive
          ? { opacity }
          : {
              animation: revealed
                ? `chart-fade-in 0.5s ease-out ${1.5 + index * 0.08}s forwards, chart-glow-pulse 3s ease-in-out ${2.5 + index * 0.08}s infinite`
                : "none",
              opacity: revealed ? undefined : 0,
            };

        return (
          <g
            key={point.id}
            className="planet-group transition-opacity duration-200"
            data-point={point.id}
            data-lon={point.lon.toFixed(4)}
            data-displaced={point.displaced ? "true" : undefined}
            style={{ ...animationStyle, cursor: "pointer" }}
            onPointerEnter={() => onPointHover(point.id)}
            onPointerLeave={() => onPointHover(null)}
            onClick={() => onPointSelect?.(point.id)}
          >
            {/* Exact-longitude ticks: on the degree scale and on the inner circle */}
            <line
              data-tick="ring"
              x1={g.ringTickStart.x}
              y1={g.ringTickStart.y}
              x2={g.ringTickEnd.x}
              y2={g.ringTickEnd.y}
              stroke={TICK_COLOR}
              strokeWidth={2.2}
              strokeLinecap="round"
            />
            <line
              data-tick="inner"
              x1={g.innerTickStart.x}
              y1={g.innerTickStart.y}
              x2={g.innerTickEnd.x}
              y2={g.innerTickEnd.y}
              stroke={TICK_COLOR}
              strokeWidth={1.6}
              strokeLinecap="round"
            />

            {/* Leader from the exact-longitude tick to the label */}
            <line
              data-leader
              x1={g.ringTickEnd.x}
              y1={g.ringTickEnd.y}
              x2={g.leaderEnd.x}
              y2={g.leaderEnd.y}
              stroke="rgba(143, 182, 255, 0.45)"
              strokeWidth={point.displaced ? 1 : 0.8}
              strokeDasharray={point.displaced ? "3 2" : undefined}
            />

            {/* Glyph */}
            <text
              data-field="glyph"
              x={g.glyph.x}
              y={g.glyph.y}
              fontSize={isFocused ? glyphSize + 4 : glyphSize}
              textAnchor="middle"
              dominantBaseline="central"
              fill={isFocused ? "#ffffff" : POINT_COLOR}
              fontFamily="serif"
              filter="url(#glow)"
              className="transition-[font-size] duration-200"
            >
              {point.glyph}
            </text>

            {/* Retrograde marker */}
            {point.retrograde && (
              <text
                data-retrograde-marker={point.id}
                x={g.retrograde.x}
                y={g.retrograde.y}
                fontSize={13}
                fontWeight={700}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#fca5a5"
              >
                R
              </text>
            )}

            {/* Degree, sign glyph and minute, stepping inwards from the glyph */}
            <text
              data-field="degree"
              x={g.degree.x}
              y={g.degree.y}
              fontSize={16}
              textAnchor="middle"
              dominantBaseline="central"
              fill="rgba(223, 234, 255, 0.9)"
            >
              {`${point.degree}°`}
            </text>
            <text
              data-field="sign"
              x={g.sign.x}
              y={g.sign.y}
              fontSize={16}
              textAnchor="middle"
              dominantBaseline="central"
              fill={signColor}
            >
              {signGlyph(point.sign)}
            </text>
            <text
              data-field="minute"
              x={g.minute.x}
              y={g.minute.y}
              fontSize={16}
              textAnchor="middle"
              dominantBaseline="central"
              fill="rgba(223, 234, 255, 0.9)"
            >
              {`${String(point.minute).padStart(2, "0")}′`}
            </text>

            {/* Invisible touch target over the whole label stack */}
            <circle
              cx={g.glyph.x}
              cy={g.glyph.y}
              r={22}
              fill="transparent"
              pointerEvents="all"
            />
          </g>
        );
      })}
    </g>
  );
}
