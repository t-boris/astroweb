import { IMAGE_GOLD, IMAGE_INK_SOFT, SITE_URL } from "./imageCommon";

/** The band under a chart image: the site address, then the lines about the chart. Drawn from y to y + FOOTER_HEIGHT. */
export default function ImageFooter({ width, y, lines }: { width: number; y: number; lines: string[] }) {
  const x = width / 2;
  return (
    <g data-image-footer>
      <line x1={x - 170} y1={y + 12} x2={x + 170} y2={y + 12} stroke={IMAGE_GOLD} strokeOpacity={0.35} strokeWidth={1.5} />
      <text data-footer-field="url" x={x} y={y + 62} textAnchor="middle" fontSize={34} letterSpacing={1} fill={IMAGE_GOLD}>
        {SITE_URL}
      </text>
      {lines.map((line, index) => (
        <text
          key={index}
          data-footer-field="meta"
          x={x}
          y={y + 104 + index * 34}
          textAnchor="middle"
          fontSize={24}
          fill={IMAGE_INK_SOFT}
        >
          {line}
        </text>
      ))}
    </g>
  );
}
