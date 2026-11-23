import type { ReactElement } from "react";
import type { i18n as I18n, TFunction } from "i18next";
import type { ChartResult } from "@/types";
import { pointLabel } from "../utils/labels";
import { buildMatrixModel } from "../matrixModel";
import { buildWheelModel } from "../wheelModel";
import MatrixImage from "./MatrixImage";
import WheelImage from "./WheelImage";
import { IMAGE_CAPTIONS, IMAGE_LANGUAGE, WHEEL_IMAGE_SIZE, sanitizeSvg, wrapText, type ChartImage } from "./imageCommon";
import { legendLineChars, matrixImageSize, type MatrixImageLabels } from "./matrixImageLayout";

/**
 * `react-dom/server` is loaded when an image is first requested, so it stays out of the page bundle. It serializes
 * the very components the page renders, which is what keeps the image and the screen in step.
 */
async function serialize(element: ReactElement): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  return sanitizeSvg(renderToStaticMarkup(element));
}

/**
 * The translator of the image texts: always the image language, never the interface language. The English
 * texts are the fallback language of the app, so they are normally loaded already; this makes sure of it.
 */
async function imageTranslator(i18n: I18n): Promise<TFunction> {
  await i18n.loadLanguages(IMAGE_LANGUAGE);
  return i18n.getFixedT(IMAGE_LANGUAGE);
}

export interface WheelImageInput {
  chart: ChartResult;
  /** The aspect types the page currently shows. */
  activeFilters: ReadonlySet<string>;
  /** Whether the page shows the aspect glyph on each line. */
  showSymbols: boolean;
  /** The app's i18next instance; the image takes its texts in the image language from it. */
  i18n: I18n;
}

/** The wheel as the page draws it with the user's current aspect filters, as a standalone SVG. */
export async function buildWheelImage(input: WheelImageInput): Promise<ChartImage> {
  const t = await imageTranslator(input.i18n);
  const model = buildWheelModel(input.chart, input.activeFilters);
  const svg = await serialize(
    <WheelImage
      model={model}
      showSymbols={input.showSymbols}
      ariaLabel={t("natalWheel.ariaLabel")}
      caption={IMAGE_CAPTIONS.wheel}
    />,
  );
  return { svg, ...WHEEL_IMAGE_SIZE };
}

export interface MatrixImageInput {
  chart: ChartResult;
  activeFilters: ReadonlySet<string>;
  /** The app's i18next instance; the image takes its texts in the image language from it. */
  i18n: I18n;
}

function matrixLabels(t: TFunction): MatrixImageLabels {
  return {
    legend: t("natalChart.matrix.legend"),
    ariaLabel: t("natalChart.matrix.title"),
    pointLabel: (id) => pointLabel(t, id),
    applyingShort: t("natalChart.aspects.applyingShort"),
    separatingShort: t("natalChart.aspects.separatingShort"),
  };
}

/** The aspect matrix with the filters the page currently applies, as a standalone SVG. */
export async function buildMatrixImage(input: MatrixImageInput): Promise<ChartImage> {
  const labels = matrixLabels(await imageTranslator(input.i18n));
  const model = buildMatrixModel(input.chart, input.activeFilters);
  const legendLines = wrapText(labels.legend, legendLineChars(model.columns.length)).length;
  const svg = await serialize(<MatrixImage model={model} labels={labels} caption={IMAGE_CAPTIONS.matrix} />);
  return { svg, ...matrixImageSize(model.columns.length, model.rows.length, legendLines) };
}
