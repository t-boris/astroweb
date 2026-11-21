import { useTranslation } from "react-i18next";
import { HelpBubble } from "@/components/HelpBubble";
import { planetHelpKey } from "@/lib/helpKeys";
import { pointGlyph } from "@astroweb/chart-core";
import { pointLabel } from "./utils/labels";

/** Glyph of a point. Text glyphs (Vx, ASC, MC) are set smaller so they fit the glyph column. */
export function PointGlyph({ id }: { id: string }) {
  const glyph = pointGlyph(id);
  return (
    <span className="g" style={glyph.length > 1 ? { fontSize: 12 } : undefined} aria-hidden="true">
      {glyph}
    </span>
  );
}

/**
 * A point as "glyph name" with its help bubble. Points without a help text of their own (nodes,
 * Lilith, Chiron, Fortune, Vertex) render without a bubble, which is what HelpBubble does for a missing key.
 */
export function PointName({ id }: { id: string }) {
  const { t } = useTranslation();
  return (
    <HelpBubble helpKey={planetHelpKey(id)}>
      <span className="ds-glyph-cell">
        <PointGlyph id={id} />
        {pointLabel(t, id)}
      </span>
    </HelpBubble>
  );
}
