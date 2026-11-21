import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ChartResult, SharedAspect } from "@/types";
import { ASPECT_COLORS, ASPECT_GLYPHS } from "@/components/chart/utils/constants";
import { ALL_ASPECT_TYPES, filterAspects, useAspectFilters } from "@/components/chart/utils/aspectFilters";
import { getSharedAspects } from "@/components/chart/utils/positions";
import {
  aspectPairKey,
  aspectsAmong,
  formatSignedOrb,
  getAnalysisPoints,
  pointGlyph,
  pointLabel,
} from "@/components/chart/utils/viewModel";
import { HelpBubble } from "@/components/HelpBubble";
import AspectFilters from "@/components/chart/AspectFilters";

const CELL = "min-w-[3.75rem] border border-[var(--line-soft)] p-1 text-center align-middle";

function glyphStyle(glyph: string) {
  return glyph.length > 1 ? { fontSize: 11 } : undefined;
}

/**
 * Lower-triangular matrix of the shared aspect set (REQ-003). A cell shows the aspect glyph, the orb and
 * an a (applying) or s (separating) marker; the marker is left out when the status does not apply.
 * The matrix opens with every aspect type visible; its filters only hide cells.
 */
export function AspectMatrix({ chart }: { chart: ChartResult }) {
  const { t } = useTranslation();
  const filters = useAspectFilters(ALL_ASPECT_TYPES);
  const points = useMemo(() => getAnalysisPoints(chart), [chart]);
  const pairs = useMemo(() => {
    const among = aspectsAmong(getSharedAspects(chart), points);
    return new Map<string, SharedAspect>(
      filterAspects(among, filters.activeFilters).map((aspect) => [aspectPairKey(aspect.a, aspect.b), aspect]),
    );
  }, [chart, points, filters.activeFilters]);

  const columns = points.slice(0, -1);
  const rows = points.slice(1);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-serif text-lg text-[#8fb6ff]">{t("natalChart.matrix.title")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("natalChart.matrix.description")}</p>
      </div>
      {/* No reset button: the matrix opens with every type visible, which is what "show all" restores. */}
      <AspectFilters
        activeFilters={filters.activeFilters}
        onToggle={filters.onToggle}
        onShowAll={filters.onShowAll}
      />
      <div className="overflow-x-auto">
        <table className="border-collapse text-xs" aria-label={t("natalChart.matrix.title")}>
          <thead>
            <tr>
              <th scope="col" className={CELL} aria-hidden="true" />
              {columns.map((point) => (
                <th
                  key={point.id}
                  scope="col"
                  className={`${CELL} font-serif text-base font-normal text-[#8fb6ff]`}
                  title={pointLabel(t, point.id)}
                  aria-label={pointLabel(t, point.id)}
                  data-point={point.id}
                >
                  <span style={glyphStyle(pointGlyph(point.id))}>{pointGlyph(point.id)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.id}>
                <th
                  scope="row"
                  className={`${CELL} sticky left-0 z-10 bg-background text-left font-normal text-[var(--ink)]`}
                  data-point={row.id}
                >
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <span className="w-6 text-center font-serif text-base text-[#8fb6ff]" style={glyphStyle(pointGlyph(row.id))}>
                      {pointGlyph(row.id)}
                    </span>
                    {pointLabel(t, row.id)}
                  </span>
                </th>
                {columns.slice(0, rowIndex + 1).map((column) => {
                  const aspect = pairs.get(aspectPairKey(row.id, column.id));
                  if (!aspect) return <td key={column.id} className={CELL} />;
                  const color = ASPECT_COLORS[aspect.type];
                  const status = aspect.applying === null ? null : aspect.applying ? "applying" : "separating";
                  const orb = formatSignedOrb(aspect);
                  const label = [
                    `${pointLabel(t, column.id)} ${t(`chart.aspects.${aspect.type}`)} ${pointLabel(t, row.id)}`,
                    `${t("tables.aspects.orb")} ${orb}`,
                    status ? t(`natalChart.aspects.${status}`) : null,
                  ]
                    .filter(Boolean)
                    .join(", ");
                  return (
                    <td
                      key={column.id}
                      className={CELL}
                      style={{
                        color,
                        borderColor: color,
                        borderStyle: aspect.major ? "solid" : "dashed",
                      }}
                      title={label}
                      aria-label={label}
                      data-a={aspect.a}
                      data-b={aspect.b}
                      data-type={aspect.type}
                      data-major={aspect.major}
                      data-orb={aspect.signedOrb.toFixed(4)}
                      data-applying={aspect.applying === null ? "none" : String(aspect.applying)}
                    >
                      <div className="text-base leading-none" aria-hidden="true">{ASPECT_GLYPHS[aspect.type]}</div>
                      <div className="mt-0.5 whitespace-nowrap text-[11px] tabular-nums" aria-hidden="true">
                        {orb}
                        {status && <span className="ml-0.5 font-semibold">{t(`natalChart.aspects.${status}Short`)}</span>}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <HelpBubble helpKey="terms.applying">
        <p className="w-fit text-xs text-muted-foreground">{t("natalChart.matrix.legend")}</p>
      </HelpBubble>
      <p className="text-xs text-muted-foreground">{t("natalChart.matrix.anglesNote")}</p>
    </div>
  );
}
