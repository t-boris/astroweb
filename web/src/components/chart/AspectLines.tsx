import { ASPECT_COLORS, ASPECT_GLYPHS } from "./utils/constants";
import {
  aspectStrokeOpacity,
  aspectStrokeWidth,
  type AspectSegment,
} from "./utils/wheelLayout";

interface AspectLinesProps {
  /** The visible aspects as chords of the aspect circle (utils/wheelLayout.ts: aspectSegments). */
  segments: AspectSegment[];
  focusId: string | null;
  /** Draw the aspect glyph on each line. */
  showSymbols: boolean;
  revealed: boolean;
}

/** Dash pattern of the minor aspects; the major aspects are solid. */
const MINOR_DASH = "6 5";
/** Lines shorter than this get no glyph: it would only blot out the line. */
const MIN_SYMBOL_LENGTH = 36;

/**
 * Aspect lines inside the inner circle. Colour tells the aspect type, a dashed stroke tells a minor
 * aspect, and the line weight grows with the tightness of the orb. Which aspects are drawn is decided
 * by the caller (the filters); this layer draws exactly what it is given.
 */
export default function AspectLines({ segments, focusId, showSymbols, revealed }: AspectLinesProps) {
  return (
    <g className="aspect-lines" data-layer="aspects" filter="url(#line-glow)">
      {segments.map((line, index) => {
        // Hover opacity logic — when hover is active, skip animation styles
        const isHoverActive = focusId !== null;

        let opacity: number | undefined;
        let strokeWidth = aspectStrokeWidth(line.exactness);
        let strokeOpacity = aspectStrokeOpacity(line.exactness);

        if (isHoverActive) {
          const connectsToFocus = line.a === focusId || line.b === focusId;
          if (connectsToFocus) {
            opacity = 1;
            strokeWidth += 0.5;
            strokeOpacity = Math.min(strokeOpacity + 0.2, 1);
          } else {
            opacity = 0.05;
          }
        }

        // Majors are drawn in with a stroke-dash reveal; the dash pattern of a minor line must survive,
        // so minors fade in instead.
        const drawIn = line.major;
        const animationStyle: React.CSSProperties = isHoverActive
          ? { opacity }
          : drawIn
            ? ({
                "--line-length": `${line.length}`,
                strokeDasharray: line.length,
                animation: revealed
                  ? `chart-line-draw 0.8s ease-out ${2.0 + index * 0.02}s forwards`
                  : "none",
                strokeDashoffset: revealed ? undefined : line.length,
              } as React.CSSProperties)
            : {
                animation: revealed
                  ? `chart-fade-in 0.8s ease-out ${2.0 + index * 0.02}s forwards`
                  : "none",
                opacity: revealed ? undefined : 0,
              };

        const color = ASPECT_COLORS[line.type] ?? "#ffffff";

        return (
          <g key={line.key} className="transition-opacity duration-200" style={isHoverActive ? { opacity } : undefined}>
            <line
              x1={line.from.x}
              y1={line.from.y}
              x2={line.to.x}
              y2={line.to.y}
              stroke={color}
              strokeWidth={strokeWidth}
              strokeOpacity={strokeOpacity}
              strokeDasharray={line.major ? undefined : MINOR_DASH}
              strokeLinecap="round"
              style={isHoverActive ? undefined : animationStyle}
              data-aspect-type={line.type}
              data-aspect-class={line.major ? "major" : "minor"}
              data-aspect-a={line.a}
              data-aspect-b={line.b}
            />
            {showSymbols && line.length >= MIN_SYMBOL_LENGTH && (
              <text
                data-aspect-symbol={line.type}
                x={line.symbol.x}
                y={line.symbol.y}
                fontSize={14}
                textAnchor="middle"
                dominantBaseline="central"
                fill={color}
                stroke="#070714"
                strokeWidth={3}
                paintOrder="stroke"
                pointerEvents="none"
                aria-hidden="true"
                style={isHoverActive || revealed ? undefined : { opacity: 0 }}
              >
                {ASPECT_GLYPHS[line.type]}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
