import type { ReactElement } from "react";
import type { ChartResult } from "@/types";
import { buildMatrixModel } from "../matrixModel";
import { buildWheelModel } from "../wheelModel";
import MatrixImage from "./MatrixImage";
import WheelImage from "./WheelImage";
import { WHEEL_IMAGE_SIZE, sanitizeSvg, wrapText, type ChartImage } from "./imageCommon";
import { legendLineChars, matrixImageSize, type MatrixImageLabels } from "./matrixImageLayout";

/**
 * `react-dom/server` is loaded when an image is first requested, so it stays out of the page bundle. It serializes
 * the very components the page renders, which is what keeps the image and the screen in step.
 */
async function serialize(element: ReactElement): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  return sanitizeSvg(renderToStaticMarkup(element));
}

export interface WheelImageInput {
  chart: ChartResult;
  /** The aspect types the page currently shows. */
  activeFilters: ReadonlySet<string>;
  /** Whether the page shows the aspect glyph on each line. */
  showSymbols: boolean;
  ariaLabel: string;
  footerLines: string[];
}

/** The wheel as the page draws it with the user's current aspect filters, as a standalone SVG. */
export async function buildWheelImage(input: WheelImageInput): Promise<ChartImage> {
  const model = buildWheelModel(input.chart, input.activeFilters);
  const svg = await serialize(
    <WheelImage model={model} showSymbols={input.showSymbols} ariaLabel={input.ariaLabel} footerLines={input.footerLines} />,
  );
  return { svg, ...WHEEL_IMAGE_SIZE };
}

export interface MatrixImageInput {
  chart: ChartResult;
  activeFilters: ReadonlySet<string>;
  labels: MatrixImageLabels;
  footerLines: string[];
}

/** The aspect matrix with the filters the page currently applies, as a standalone SVG. */
export async function buildMatrixImage(input: MatrixImageInput): Promise<ChartImage> {
  const model = buildMatrixModel(input.chart, input.activeFilters);
  const legendLines = wrapText(input.labels.legend, legendLineChars(model.columns.length)).length;
  const svg = await serialize(<MatrixImage model={model} labels={input.labels} footerLines={input.footerLines} />);
  return { svg, ...matrixImageSize(model.columns.length, model.rows.length, legendLines) };
}
