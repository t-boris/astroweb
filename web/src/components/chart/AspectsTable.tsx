import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ChartResult, SharedAspect } from "@/types";
import { ASPECT_COLORS, ASPECT_GLYPHS } from "@/components/chart/utils/constants";
import { filterAspects, useAspectFilters } from "@/components/chart/utils/aspectFilters";
import { getSharedAspects } from "@/components/chart/utils/positions";
import { formatSignedOrb } from "@/components/chart/utils/viewModel";
import { aspectHelpKey } from "@/lib/helpKeys";
import { HelpBubble } from "@/components/HelpBubble";
import AspectFilters from "@/components/chart/AspectFilters";
import { PointName } from "@/components/chart/PointName";

interface AspectsListProps {
  /** Aspects to show, already filtered. They keep the order of the shared set: most exact first. */
  aspects: SharedAspect[];
}

/** The Aspects list for a set of aspects. Exported without the filters so it can be checked against the full set. */
export function AspectsList({ aspects }: AspectsListProps) {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto">
      <table className="ds-table min-w-[640px]">
        <thead>
          <tr>
            <HelpBubble helpKey="terms.body"><th>{t("tables.aspects.bodyA")}</th></HelpBubble>
            <HelpBubble helpKey="terms.aspect"><th>{t("tables.aspects.type")}</th></HelpBubble>
            <HelpBubble helpKey="terms.body"><th>{t("tables.aspects.bodyB")}</th></HelpBubble>
            <HelpBubble helpKey="terms.orb"><th>{t("tables.aspects.orb")}</th></HelpBubble>
            <HelpBubble helpKey="terms.applying"><th>{t("natalChart.aspects.status")}</th></HelpBubble>
            <HelpBubble helpKey="terms.exactness"><th>{t("tables.aspects.exactness")}</th></HelpBubble>
          </tr>
        </thead>
        <tbody>
          {aspects.map((aspect) => {
            const pct = Math.round(aspect.exactness * 100);
            const aspectColor = ASPECT_COLORS[aspect.type];
            const status = aspect.applying === null ? null : aspect.applying ? "applying" : "separating";
            return (
              <tr
                key={`${aspect.a}-${aspect.b}-${aspect.type}`}
                data-a={aspect.a}
                data-b={aspect.b}
                data-type={aspect.type}
                data-major={aspect.major}
                data-orb={aspect.signedOrb.toFixed(4)}
                data-applying={aspect.applying === null ? "none" : String(aspect.applying)}
              >
                <td>
                  <PointName id={aspect.a} />
                </td>
                <td>
                  <HelpBubble helpKey={aspectHelpKey(aspect.type)}>
                    <span className="ds-chip" style={aspect.major ? undefined : { borderStyle: "dashed" }}>
                      <span
                        className="dotline"
                        style={{ borderColor: aspectColor, borderTopStyle: aspect.major ? "solid" : "dashed" }}
                      />
                      <span aria-hidden="true">{ASPECT_GLYPHS[aspect.type]}</span>
                      {t(`chart.aspects.${aspect.type}`)}
                    </span>
                  </HelpBubble>
                </td>
                <td>
                  <PointName id={aspect.b} />
                </td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{formatSignedOrb(aspect)}</td>
                <td>{status ? t(`natalChart.aspects.${status}`) : "—"}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-16 overflow-hidden rounded-full" style={{ background: "rgba(140,165,235,0.18)" }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: aspectColor }} />
                    </div>
                    <span className="text-xs text-muted-foreground">{pct}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface AspectsTableProps {
  chart: ChartResult;
}

/**
 * The Aspects list: the shared aspect set of the chart, opened with the major aspects and able to reveal
 * the minor ones. The filters hide rows only; the values of a row never depend on them (DEC-011).
 */
export function AspectsTable({ chart }: AspectsTableProps) {
  const { t } = useTranslation();
  const filters = useAspectFilters();
  const shared = useMemo(() => getSharedAspects(chart), [chart]);
  const visible = useMemo(() => filterAspects(shared, filters.activeFilters), [shared, filters.activeFilters]);

  return (
    <div className="space-y-4">
      <AspectFilters {...filters} />
      {visible.length > 0 ? (
        <AspectsList aspects={visible} />
      ) : (
        <p className="text-center text-sm text-muted-foreground">{t("natalChart.aspects.empty")}</p>
      )}
    </div>
  );
}
