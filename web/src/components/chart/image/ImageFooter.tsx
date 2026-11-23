import { FOOTER_FONT_SIZE, FOOTER_HEIGHT, FOOTER_INSET, IMAGE_GOLD, IMAGE_INK_SOFT, SITE_URL } from "./imageCommon";

/**
 * The band under a chart image, drawn from y to y + FOOTER_HEIGHT: one small line with the caption (what the
 * picture is and where it comes from) on the left and the site address on the right. Nothing else is printed.
 */
export default function ImageFooter({ width, y, caption }: { width: number; y: number; caption: string }) {
  const baseline = y + FOOTER_HEIGHT / 2 + FOOTER_FONT_SIZE * 0.35;
  return (
    <g data-image-footer fontSize={FOOTER_FONT_SIZE}>
      <text data-footer-field="caption" x={FOOTER_INSET} y={baseline} textAnchor="start" fill={IMAGE_INK_SOFT}>
        {caption}
      </text>
      <text data-footer-field="url" x={width - FOOTER_INSET} y={baseline} textAnchor="end" letterSpacing={0.5} fill={IMAGE_GOLD}>
        {SITE_URL}
      </text>
    </g>
  );
}
