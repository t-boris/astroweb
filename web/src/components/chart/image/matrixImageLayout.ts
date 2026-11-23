import { FOOTER_HEIGHT } from "./imageCommon";

export const PAD = 40;
export const LABEL_W = 250;
export const CELL_W = 88;
export const CELL_H = 64;
export const HEAD_H = 70;
export const LEGEND_FONT = 19;
export const LEGEND_LINE = 28;
export const MINOR_DASH = "6 4";

/** The texts of the matrix image, all in the image language. */
export interface MatrixImageLabels {
  /** The "a = applying, s = separating" explanation. */
  legend: string;
  ariaLabel: string;
  pointLabel: (id: string) => string;
  applyingShort: string;
  separatingShort: string;
}

/** Size of the matrix image for a matrix of `columns` by `rows` cells and a legend of `legendLines` lines. */
export function matrixImageSize(columns: number, rows: number, legendLines: number): { width: number; height: number } {
  const width = PAD + LABEL_W + columns * CELL_W + PAD;
  const gridBottom = PAD + HEAD_H + rows * CELL_H;
  const height = gridBottom + 36 + legendLines * LEGEND_LINE + 24 + FOOTER_HEIGHT;
  return { width, height };
}

/** Characters of the legend that fit on one line of the image. */
export function legendLineChars(columns: number): number {
  const width = PAD + LABEL_W + columns * CELL_W + PAD;
  return Math.floor((width - 2 * PAD) / (LEGEND_FONT * 0.54));
}

