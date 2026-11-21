import {
  PLANET_GLYPHS,
  SIGN_ELEMENTS,
  SIGN_MODALITIES,
  formatDegreeMinute,
  isTimeEstimated,
  splitLongitude,
  type Element,
  type Modality,
} from "@astroweb/chart-core";
import type { ChartResult } from "@/types";

export type BigThreeId = "sun" | "moon" | "rising";

/** One of the Big Three: where it stands in the chart and where its explanation text lives. */
export interface BigThreeItem {
  id: BigThreeId;
  /** Body name for the help texts: "Sun", "Moon" or "ASC". */
  body: "Sun" | "Moon" | "ASC";
  glyph: string;
  /** English sign name; null when the Rising sign cannot be worked out (no birth time). */
  sign: string | null;
  element: Element | null;
  modality: Modality | null;
  /** Degree and minute within the sign, "9°10′". */
  degree: string | null;
  /** House number; the Rising sign is by definition the first house. */
  house: number | null;
  /** Translation key of the per-sign interpretation (`<key>.text`), null when there is no sign. */
  textKey: string | null;
}

function build(
  id: BigThreeId,
  body: BigThreeItem["body"],
  glyph: string,
  lon: number | null,
  house: number | null,
  category: "sun" | "moon" | "ascendant",
): BigThreeItem {
  if (lon === null) {
    return { id, body, glyph, sign: null, element: null, modality: null, degree: null, house: null, textKey: null };
  }
  const { sign } = splitLongitude(lon);
  return {
    id,
    body,
    glyph,
    sign,
    element: SIGN_ELEMENTS[sign] ?? null,
    modality: SIGN_MODALITIES[sign] ?? null,
    degree: formatDegreeMinute(lon),
    house,
    textKey: `interpretation.${category}.${sign.toLowerCase()}`,
  };
}

/**
 * The Sun, the Moon and the Rising sign of a chart, always in this order. The Rising sign depends on the exact
 * birth time: for a chart calculated for local noon (time unknown) it is returned without a sign.
 */
export function buildBigThree(chart: ChartResult): BigThreeItem[] {
  const sun = chart.points.find((p) => p.body === "Sun");
  const moon = chart.points.find((p) => p.body === "Moon");
  const asc = chart.houses.asc !== null && !isTimeEstimated(chart) ? chart.houses.asc : null;
  return [
    build("sun", "Sun", PLANET_GLYPHS.Sun, sun?.lon ?? null, sun?.house ?? null, "sun"),
    build("moon", "Moon", PLANET_GLYPHS.Moon, moon?.lon ?? null, moon?.house ?? null, "moon"),
    build("rising", "ASC", "↑", asc, asc === null ? null : 1, "ascendant"),
  ];
}
