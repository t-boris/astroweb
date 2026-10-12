import { useTranslation } from "react-i18next";
import type { ChartPoint } from "@/types";
import { signLabel } from "@/lib/signs";
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
            <th>{t("tables.planets.body")}</th>
            <th>{t("tables.planets.sign")}</th>
            <th>{t("tables.planets.degree")}</th>
            <th>{t("tables.planets.house")}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => {
            const deg = Math.floor(point.degreeInSign);
            const arcmin = Math.round((point.degreeInSign % 1) * 60);
            return (
              <tr key={point.body}>
                <td>
                  <span className="ds-glyph-cell">
                    <span className="g">{PLANET_GLYPHS[point.body] ?? ""}</span>
                    {point.body}
                  </span>
                </td>
                <td>
                  <span className="ds-glyph-cell">
                    <span className="g" style={{ fontSize: 16 }}>{ZODIAC_GLYPHS[point.sign] ?? ""}</span>
                    {signLabel(t, point.sign)}
                  </span>
                </td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>
                  {deg}&deg;{String(arcmin).padStart(2, "0")}&apos;
                </td>
                <td>{point.house ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
