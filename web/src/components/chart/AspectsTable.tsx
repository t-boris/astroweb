import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ChartAspect } from "@/types";
import {
  PLANET_GLYPHS,
  ASPECT_COLORS,
} from "@/components/chart/utils/constants";

interface AspectsTableProps {
  aspects: ChartAspect[];
}

export function AspectsTable({ aspects }: AspectsTableProps) {
  const { t } = useTranslation();

  const sorted = useMemo(
    () => [...aspects].sort((a, b) => b.exactness - a.exactness),
    [aspects],
  );

  return (
    <div className="overflow-x-auto">
      <table className="ds-table min-w-[520px]">
        <thead>
          <tr>
            <th>{t("tables.aspects.bodyA")}</th>
            <th>{t("tables.aspects.type")}</th>
            <th>{t("tables.aspects.bodyB")}</th>
            <th>{t("tables.aspects.orb")}</th>
            <th>{t("tables.aspects.exactness")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((aspect) => {
            const pct = Math.round(aspect.exactness * 100);
            const aspectColor = ASPECT_COLORS[aspect.type];
            return (
              <tr key={`${aspect.a}-${aspect.b}-${aspect.type}`}>
                <td>
                  <span className="ds-glyph-cell">
                    <span className="g">{PLANET_GLYPHS[aspect.a] ?? ""}</span>
                    {aspect.a}
                  </span>
                </td>
                <td>
                  <span className="ds-chip">
                    <span className="dotline" style={{ borderColor: aspectColor }} />
                    {t(`chart.aspects.${aspect.type}`)}
                  </span>
                </td>
                <td>
                  <span className="ds-glyph-cell">
                    <span className="g">{PLANET_GLYPHS[aspect.b] ?? ""}</span>
                    {aspect.b}
                  </span>
                </td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{aspect.orb.toFixed(1)}&deg;</td>
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
