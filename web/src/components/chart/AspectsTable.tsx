import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ChartAspect } from "@/types";
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
  ASPECT_GLYPHS,
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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("tables.aspects.bodyA")}</TableHead>
          <TableHead>{t("tables.aspects.type")}</TableHead>
          <TableHead>{t("tables.aspects.bodyB")}</TableHead>
          <TableHead>{t("tables.aspects.orb")}</TableHead>
          <TableHead>{t("tables.aspects.exactness")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((aspect) => {
          const pct = Math.round(aspect.exactness * 100);
          const aspectColor = ASPECT_COLORS[aspect.type];

          return (
            <TableRow
              key={`${aspect.a}-${aspect.b}-${aspect.type}`}
              className="hover:bg-muted/50"
            >
              <TableCell>
                {PLANET_GLYPHS[aspect.a] ?? ""} {aspect.a}
              </TableCell>
              <TableCell style={{ color: aspectColor }}>
                {ASPECT_GLYPHS[aspect.type] ?? ""}{" "}
                {t(`chart.aspects.${aspect.type}`)}
              </TableCell>
              <TableCell>
                {PLANET_GLYPHS[aspect.b] ?? ""} {aspect.b}
              </TableCell>
              <TableCell>{aspect.orb.toFixed(1)}&deg;</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: aspectColor,
                      }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{pct}%</span>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
