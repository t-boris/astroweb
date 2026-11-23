import { ASPECT_COLORS, ASPECT_GLYPHS, formatSignedOrb, pointGlyph } from "@astroweb/chart-core";
import { aspectStatus, matrixAspect, type MatrixModel } from "../matrixModel";
import ImageFooter from "./ImageFooter";
import {
  FOOTER_HEIGHT,
  IMAGE_ACCENT,
  IMAGE_BG,
  IMAGE_FONT,
  IMAGE_INK,
  IMAGE_INK_SOFT,
  IMAGE_SERIF,
  SVG_NS,
  wrapText,
} from "./imageCommon";
import {
  CELL_H,
  CELL_W,
  HEAD_H,
  LABEL_W,
  LEGEND_FONT,
  LEGEND_LINE,
  MINOR_DASH,
  PAD,
  legendLineChars,
  matrixImageSize,
  type MatrixImageLabels,
} from "./matrixImageLayout";

/** Letter glyphs (Vx, Q, bQ) are drawn smaller than the symbols so they sit with them. */
function glyphSize(glyph: string, normal: number): number {
  return /^[A-Za-z]+$/.test(glyph) ? Math.round(normal * (glyph.length > 1 ? 0.55 : 0.7)) : normal;
}

/**
 * The lower-triangular aspect matrix as an image: the cells of the on-screen table (same model), each with the
 * aspect glyph, the signed orb and the applying or separating mark, in the aspect colour (dashed for minors).
 * There is no title: the caption in the footer says what the picture is.
 */
export default function MatrixImage({
  model,
  labels,
  caption,
}: {
  model: MatrixModel;
  labels: MatrixImageLabels;
  caption: string;
}) {
  const { columns, rows } = model;
  const legend = wrapText(labels.legend, legendLineChars(columns.length));
  const { width, height } = matrixImageSize(columns.length, rows.length, legend.length);
  const gridX = PAD + LABEL_W;
  const gridY = PAD + HEAD_H;
  const gridBottom = gridY + rows.length * CELL_H;
  const legendY = gridBottom + 36;
  const footerY = height - FOOTER_HEIGHT;

  return (
    <svg
      xmlns={SVG_NS}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      fontFamily={IMAGE_FONT}
      role="img"
      aria-label={labels.ariaLabel}
    >
      <rect width={width} height={height} fill={IMAGE_BG} />

      {columns.map((point, index) => {
        const glyph = pointGlyph(point.id);
        return (
          <text
            key={point.id}
            data-column={point.id}
            x={gridX + index * CELL_W + CELL_W / 2}
            y={gridY - 22}
            fontSize={glyphSize(glyph, 30)}
            textAnchor="middle"
            fill={IMAGE_ACCENT}
            fontFamily={IMAGE_SERIF}
          >
            {glyph}
          </text>
        );
      })}

      {rows.map((row, rowIndex) => {
        const top = gridY + rowIndex * CELL_H;
        const glyph = pointGlyph(row.id);
        return (
          <g key={row.id} data-row={row.id}>
            <text
              x={PAD + 22}
              y={top + CELL_H / 2}
              fontSize={glyphSize(glyph, 26)}
              textAnchor="middle"
              dominantBaseline="central"
              fill={IMAGE_ACCENT}
              fontFamily={IMAGE_SERIF}
            >
              {glyph}
            </text>
            <text x={PAD + 54} y={top + CELL_H / 2} fontSize={19} dominantBaseline="central" fill={IMAGE_INK}>
              {labels.pointLabel(row.id)}
            </text>
            {columns.slice(0, rowIndex + 1).map((column, columnIndex) => {
              const x = gridX + columnIndex * CELL_W;
              const aspect = matrixAspect(model, row.id, column.id);
              if (!aspect) {
                return (
                  <rect
                    key={column.id}
                    x={x + 2}
                    y={top + 2}
                    width={CELL_W - 4}
                    height={CELL_H - 4}
                    rx={6}
                    fill="none"
                    stroke="rgba(160,180,240,0.28)"
                  />
                );
              }
              const color = ASPECT_COLORS[aspect.type];
              const status = aspectStatus(aspect);
              const mark = status === "applying" ? labels.applyingShort : status === "separating" ? labels.separatingShort : "";
              const orb = formatSignedOrb(aspect);
              return (
                <g
                  key={column.id}
                  data-a={aspect.a}
                  data-b={aspect.b}
                  data-type={aspect.type}
                  data-major={aspect.major}
                  data-orb={aspect.signedOrb.toFixed(4)}
                  data-applying={aspect.applying === null ? "none" : String(aspect.applying)}
                >
                  <rect
                    x={x + 2}
                    y={top + 2}
                    width={CELL_W - 4}
                    height={CELL_H - 4}
                    rx={6}
                    fill={color}
                    fillOpacity={0.09}
                    stroke={color}
                    strokeWidth={1.5}
                    strokeDasharray={aspect.major ? undefined : MINOR_DASH}
                  />
                  <text
                    data-cell-field="glyph"
                    x={x + CELL_W / 2}
                    y={top + 28}
                    fontSize={glyphSize(ASPECT_GLYPHS[aspect.type], 28)}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={color}
                    fontFamily={IMAGE_SERIF}
                  >
                    {ASPECT_GLYPHS[aspect.type]}
                  </text>
                  <text
                    data-cell-field="orb"
                    x={x + CELL_W / 2}
                    y={top + 51}
                    fontSize={15}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={color}
                  >
                    {mark ? `${orb} ${mark}` : orb}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}

      {legend.map((line, index) => (
        <text key={index} data-matrix-legend x={PAD} y={legendY + index * LEGEND_LINE} fontSize={LEGEND_FONT} fill={IMAGE_INK_SOFT}>
          {line}
        </text>
      ))}

      <ImageFooter width={width} y={footerY} caption={caption} />
    </svg>
  );
}
