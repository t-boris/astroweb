import { useTranslation } from "react-i18next";
import type { ChartPoint } from "@/types";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  PLANET_GLYPHS,
  ZODIAC_GLYPHS,
  SIGN_ELEMENTS,
  ELEMENT_COLORS,
} from "@/components/chart/utils/constants";

interface PlanetsTableProps {
  points: ChartPoint[];
}

export function PlanetsTable({ points }: PlanetsTableProps) {
  const { t } = useTranslation();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("tables.planets.body")}</TableHead>
          <TableHead>{t("tables.planets.sign")}</TableHead>
          <TableHead>{t("tables.planets.degree")}</TableHead>
          <TableHead>{t("tables.planets.house")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {points.map((point) => {
          const deg = Math.floor(point.degreeInSign);
          const arcmin = Math.round((point.degreeInSign % 1) * 60);
          const element = SIGN_ELEMENTS[point.sign];
          const elementColor = ELEMENT_COLORS[element]?.text;

          return (
            <TableRow key={point.body} className="hover:bg-muted/50">
              <TableCell>
                {PLANET_GLYPHS[point.body] ?? ""} {point.body}
              </TableCell>
              <TableCell style={{ color: elementColor }}>
                {ZODIAC_GLYPHS[point.sign] ?? ""} {point.sign}
              </TableCell>
              <TableCell>
                {deg}&deg;{String(arcmin).padStart(2, "0")}&apos;
              </TableCell>
              <TableCell>{point.house ?? "\u2014"}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
