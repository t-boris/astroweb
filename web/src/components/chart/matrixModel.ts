import {
  aspectPairKey,
  aspectsAmong,
  filterAspects,
  getAnalysisPoints,
  getSharedAspects,
  type TablePoint,
} from "@astroweb/chart-core";
import type { ChartResult, SharedAspect } from "@/types";

/** The lower-triangular aspect matrix as data: the table on the Aspects tab and the image export both read it. */
export interface MatrixModel {
  /** Every point of the matrix in display order. */
  points: TablePoint[];
  /** Column headers: all points but the last. */
  columns: TablePoint[];
  /** Row headers: all points but the first. A row holds the cells of the columns up to the row above it. */
  rows: TablePoint[];
  /** The aspects that survive the filters, by the key of their two points. */
  pairs: Map<string, SharedAspect>;
}

export function buildMatrixModel(chart: ChartResult, activeFilters: ReadonlySet<string>): MatrixModel {
  const points = getAnalysisPoints(chart);
  const among = aspectsAmong(getSharedAspects(chart), points);
  const pairs = new Map<string, SharedAspect>(
    filterAspects(among, activeFilters).map((aspect) => [aspectPairKey(aspect.a, aspect.b), aspect]),
  );
  return { points, columns: points.slice(0, -1), rows: points.slice(1), pairs };
}

/** The aspect between the row point and the column point, if one is drawn. */
export function matrixAspect(model: MatrixModel, rowId: string, columnId: string): SharedAspect | undefined {
  return model.pairs.get(aspectPairKey(rowId, columnId));
}

/** `applying`, `separating`, or null when the status does not apply (a pair of fast-moving points). */
export function aspectStatus(aspect: SharedAspect): "applying" | "separating" | null {
  return aspect.applying === null ? null : aspect.applying ? "applying" : "separating";
}
