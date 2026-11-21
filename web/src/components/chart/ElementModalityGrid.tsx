import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ChartResult } from "@/types";
import {
  ELEMENTS,
  MODALITIES,
  getAnalysisPoints,
  groupByElementModality,
  pointGlyph,
} from "@astroweb/chart-core";
import { ELEMENT_COLORS } from "@/components/chart/utils/elementColors";
import { pointLabel } from "@/components/chart/utils/labels";
import { elementHelpKey } from "@/lib/helpKeys";
import { HelpBubble } from "@/components/HelpBubble";

const CELL = "border border-[var(--line-soft)] px-3 py-2 align-top";

/**
 * Element-by-modality summary (REQ-004): which points sit in fire, earth, air and water signs across the
 * cardinal, fixed and mutable ones, with row and column totals. It counts the points listed in
 * getAnalysisPoints, the same ones the aspect matrix uses.
 */
export function ElementModalityGrid({ chart }: { chart: ChartResult }) {
  const { t } = useTranslation();
  const groups = useMemo(() => groupByElementModality(getAnalysisPoints(chart)), [chart]);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-serif text-lg text-[#8fb6ff]">{t("natalChart.summary.gridTitle")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("natalChart.summary.inclusionRule", { count: groups.total })}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-sm" aria-label={t("natalChart.summary.gridTitle")}>
          <thead>
            <tr>
              <td className={CELL} />
              {MODALITIES.map((modality) => (
                <HelpBubble key={modality} helpKey="terms.modality">
                  <th scope="col" className={`${CELL} text-left font-semibold text-muted-foreground`}>
                    {t(`natalChart.summary.modalities.${modality}`)}
                  </th>
                </HelpBubble>
              ))}
              <th scope="col" className={`${CELL} text-right font-semibold text-muted-foreground`}>
                {t("natalChart.summary.total")}
              </th>
            </tr>
          </thead>
          <tbody>
            {ELEMENTS.map((element) => (
              <tr key={element}>
                <HelpBubble helpKey={elementHelpKey(element)}>
                  <th
                    scope="row"
                    className={`${CELL} text-left font-semibold`}
                    style={{ color: ELEMENT_COLORS[element].text }}
                  >
                    {t(`interpretation.overview.elements.${element}`)}
                  </th>
                </HelpBubble>
                {MODALITIES.map((modality) => {
                  const members = groups.cells[element][modality];
                  return (
                    <td
                      key={modality}
                      className={CELL}
                      data-element={element}
                      data-modality={modality}
                      data-count={members.length}
                    >
                      <span className="flex flex-wrap gap-x-2 gap-y-1 font-serif text-lg leading-none">
                        {members.map((point) => (
                          <span
                            key={point.id}
                            role="img"
                            aria-label={pointLabel(t, point.id)}
                            title={pointLabel(t, point.id)}
                            data-point={point.id}
                            style={pointGlyph(point.id).length > 1 ? { fontSize: 12 } : undefined}
                          >
                            {pointGlyph(point.id)}
                          </span>
                        ))}
                      </span>
                    </td>
                  );
                })}
                <td className={`${CELL} text-right tabular-nums`} data-element-total={element}>
                  {groups.elementTotals[element]}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className={`${CELL} text-left font-semibold text-muted-foreground`}>
                {t("natalChart.summary.total")}
              </th>
              {MODALITIES.map((modality) => (
                <td key={modality} className={`${CELL} tabular-nums`} data-modality-total={modality}>
                  {groups.modalityTotals[modality]}
                </td>
              ))}
              <td className={`${CELL} text-right font-semibold tabular-nums`} data-grand-total={groups.total}>
                {groups.total}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
