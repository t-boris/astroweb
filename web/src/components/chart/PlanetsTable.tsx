import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ChartResult } from "@/types";
import { signLabel } from "@/lib/signs";
import { houseHelpKey, signHelpKey } from "@/lib/helpKeys";
import { HelpBubble } from "@/components/HelpBubble";
import { ZODIAC_GLYPHS } from "@/components/chart/utils/constants";
import { formatDegreeMinute, isTimeEstimated } from "@/components/chart/utils/positions";
import { getTablePoints, type TablePoint } from "@/components/chart/utils/viewModel";
import { PointName } from "@/components/chart/PointName";

interface PlanetsTableProps {
  chart: ChartResult;
}

/** The retrograde cell: an R when retrograde, empty when direct, a dash when motion does not apply. */
function RetrogradeCell({ point }: { point: TablePoint }) {
  const { t } = useTranslation();
  if (point.retrograde === null) {
    return (
      <td aria-label={t("natalChart.positions.notApplicable")} style={{ color: "var(--faint)" }}>
        —
      </td>
    );
  }
  return (
    <td data-retrograde={point.retrograde}>
      {point.retrograde && (
        <abbr
          title={t("natalChart.positions.retrograde")}
          aria-label={t("natalChart.positions.retrograde")}
          className="font-semibold text-[#f2a65a] no-underline"
        >
          {t("natalChart.positions.retrogradeShort")}
        </abbr>
      )}
    </td>
  );
}

export function PlanetsTable({ chart }: PlanetsTableProps) {
  const { t } = useTranslation();
  const points = useMemo(() => getTablePoints(chart), [chart]);
  const estimated = isTimeEstimated(chart);
  const chironMissing = chart.context?.chironAvailable === false;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="ds-table min-w-[480px]">
          <thead>
            <tr>
              <HelpBubble helpKey="terms.body"><th>{t("tables.planets.body")}</th></HelpBubble>
              <HelpBubble helpKey="terms.sign"><th>{t("tables.planets.sign")}</th></HelpBubble>
              <HelpBubble helpKey="terms.degree"><th>{t("tables.planets.degree")}</th></HelpBubble>
              <HelpBubble helpKey="terms.house"><th>{t("tables.planets.house")}</th></HelpBubble>
              <HelpBubble helpKey="terms.retrograde">
                <th aria-label={t("natalChart.positions.retrograde")}>{t("natalChart.positions.retrogradeShort")}</th>
              </HelpBubble>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.id} data-point={point.id}>
                <td>
                  <PointName id={point.id} />
                </td>
                <td>
                  <HelpBubble helpKey={signHelpKey(point.sign)}>
                    <span className="ds-glyph-cell">
                      <span className="g" style={{ fontSize: 16 }}>{ZODIAC_GLYPHS[point.sign] ?? ""}</span>
                      {signLabel(t, point.sign)}
                    </span>
                  </HelpBubble>
                </td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{formatDegreeMinute(point.lon)}</td>
                {typeof point.house === "number" ? (
                  <HelpBubble helpKey={houseHelpKey(point.house)}>
                    <td>{point.house}</td>
                  </HelpBubble>
                ) : (
                  <td aria-label={t("natalChart.positions.noHouse")}>—</td>
                )}
                <RetrogradeCell point={point} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {estimated && (
        <p className="text-xs text-muted-foreground">{t("natalChart.positions.estimateNote")}</p>
      )}
      {chironMissing && (
        <p className="text-xs text-muted-foreground">{t("natalChart.positions.chironUnavailable")}</p>
      )}
    </div>
  );
}
