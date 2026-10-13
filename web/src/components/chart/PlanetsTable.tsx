import { useTranslation } from "react-i18next";
import type { ChartPoint } from "@/types";
import { signLabel } from "@/lib/signs";
import { houseHelpKey, planetHelpKey, signHelpKey } from "@/lib/helpKeys";
import { HelpBubble } from "@/components/HelpBubble";
import {
  PLANET_GLYPHS,
  ZODIAC_GLYPHS,
} from "@/components/chart/utils/constants";

interface PlanetsTableProps {
  points: ChartPoint[];
}

export function PlanetsTable({ points }: PlanetsTableProps) {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto">
      <table className="ds-table min-w-[420px]">
        <thead>
          <tr>
            <HelpBubble helpKey="terms.body"><th>{t("tables.planets.body")}</th></HelpBubble>
            <HelpBubble helpKey="terms.sign"><th>{t("tables.planets.sign")}</th></HelpBubble>
            <HelpBubble helpKey="terms.degree"><th>{t("tables.planets.degree")}</th></HelpBubble>
            <HelpBubble helpKey="terms.house"><th>{t("tables.planets.house")}</th></HelpBubble>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => {
            const deg = Math.floor(point.degreeInSign);
            const arcmin = Math.round((point.degreeInSign % 1) * 60);
            return (
              <tr key={point.body}>
                <td>
                  <HelpBubble helpKey={planetHelpKey(point.body)}>
                    <span className="ds-glyph-cell">
                      <span className="g">{PLANET_GLYPHS[point.body] ?? ""}</span>
                      {point.body}
                    </span>
                  </HelpBubble>
                </td>
                <td>
                  <HelpBubble helpKey={signHelpKey(point.sign)}>
                    <span className="ds-glyph-cell">
                      <span className="g" style={{ fontSize: 16 }}>{ZODIAC_GLYPHS[point.sign] ?? ""}</span>
                      {signLabel(t, point.sign)}
                    </span>
                  </HelpBubble>
                </td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>
                  {deg}&deg;{String(arcmin).padStart(2, "0")}&apos;
                </td>
                {typeof point.house === "number" ? (
                  <HelpBubble helpKey={houseHelpKey(point.house)}>
                    <td>{point.house}</td>
                  </HelpBubble>
                ) : (
                  <td>—</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
