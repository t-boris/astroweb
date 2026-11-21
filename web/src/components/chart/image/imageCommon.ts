import type { TFunction } from "i18next";
import { CHART_LAYOUT, getHouseSystemInfo, isTimeEstimated } from "@astroweb/chart-core";
import type { ChartResult } from "@/types";
import { houseSystemName } from "../utils/labels";

/** The address printed on every downloaded chart image. */
export const SITE_URL = "https://natalmystic.com";

export const SVG_NS = "http://www.w3.org/2000/svg";

/** Background of the downloaded images: a dark navy lighter than the page, so lines and small text stay readable on a shared picture. */
export const IMAGE_BG = "#20284f";
export const IMAGE_GOLD = "#e8c969";
export const IMAGE_INK = "#eaf0ff";
export const IMAGE_INK_SOFT = "#c4cde8";
export const IMAGE_ACCENT = "#8fb6ff";

/**
 * Fonts of the standalone image. An SVG drawn as an image cannot load the page's web fonts, so the stack
 * names the page fonts first (used when installed) and then the system fonts that carry the astrological symbols.
 */
export const IMAGE_FONT =
  "'Hanken Grotesk', 'Helvetica Neue', Arial, 'Segoe UI Symbol', 'Apple Symbols', 'Noto Sans Symbols', sans-serif";
export const IMAGE_SERIF = "Marcellus, Georgia, 'Times New Roman', serif";

/** Height of the band under the chart: the address and up to two lines about the chart. */
export const FOOTER_HEIGHT = 156;

/** Empty border around the wheel disc in the wheel image: as small as it can be, so the chart fills the picture. */
export const WHEEL_IMAGE_MARGIN = 6;

/** Size of the wheel image in SVG units: the wheel with its margin, then the footer. */
export const WHEEL_IMAGE_SIZE = {
  width: CHART_LAYOUT.size + 2 * WHEEL_IMAGE_MARGIN,
  height: CHART_LAYOUT.size + 2 * WHEEL_IMAGE_MARGIN + FOOTER_HEIGHT,
};

/** What the profile page tells the image about the chart; no name and no coordinates. */
export interface ChartImageContext {
  /** Birth date as entered, YYYY-MM-DD. */
  birthDate: string;
  /** Birth time as entered, HH:mm; ignored when the chart is an estimate for local noon. */
  birthTime: string | null;
  /** The place the chart is calculated for: the birth place or the relocation place. */
  placeName: string;
  /** True when the chart is drawn for a place other than the birth place. */
  relocated: boolean;
}

export type ImageKind = "wheel" | "matrix";

/** File names carry no profile data. */
export const IMAGE_FILE_NAMES: Record<ImageKind, string> = {
  wheel: "natal-chart.png",
  matrix: "natal-chart-aspects.png",
};

/** A finished image: the standalone SVG and its size in SVG units. */
export interface ChartImage {
  svg: string;
  width: number;
  height: number;
}

const MAX_PLACE_CHARS = 46;

/** Cut by characters (code points), never inside a surrogate pair, and mark the cut with an ellipsis. */
export function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join("").trimEnd()}…`;
}

/**
 * Make free text (the place name) safe for an SVG that is decoded as an image: characters that are not
 * allowed in XML are dropped and a lone surrogate (which makes `encodeURIComponent` throw) becomes U+FFFD.
 */
export function cleanText(text: string): string {
  let result = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x08 || code === 0x0b || code === 0x0c || (code >= 0x0e && code <= 0x1f) || code === 0xfffe || code === 0xffff) {
      continue;
    }
    result += char.length === 1 && code >= 0xd800 && code <= 0xdfff ? "\uFFFD" : char;
  }
  return result;
}

/** "1 January 1990" in the interface language; the date is read as a calendar date, never shifted by a time zone. */
export function formatBirthDate(isoDate: string, language: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  try {
    return new Intl.DateTimeFormat(language, {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(year, month - 1, day)));
  } catch {
    return isoDate;
  }
}

/**
 * The lines under the address: the birth date with the time (or a note that the time is unknown), then the place
 * with the house system the chart was calculated with. An estimate for local noon has no houses, so none is named.
 */
export function composeFooterLines(
  t: TFunction,
  language: string,
  chart: ChartResult,
  context: ChartImageContext,
): string[] {
  const estimated = isTimeEstimated(chart);
  const time = estimated ? t("chartImage.footer.timeUnknown") : context.birthTime ?? chart.meta.timeUsed;
  const dateLine = [formatBirthDate(context.birthDate, language), time].filter(Boolean).join(" · ");

  // The name is cut before the "relocated" wording is added, so a long name never hides that the chart is relocated.
  const shownName = context.placeName ? truncate(cleanText(context.placeName).trim(), MAX_PLACE_CHARS) : "";
  const place = shownName && context.relocated ? t("natalChart.context.relocatedPlace", { place: shownName }) : shownName;
  const houses = estimated
    ? ""
    : t("chartImage.footer.houses", { system: houseSystemName(t, getHouseSystemInfo(chart).used) });
  const placeLine = [place, houses].filter(Boolean).join(" · ");

  return [dateLine, placeLine].filter(Boolean);
}

/** Wrap text at spaces into lines of at most `maxChars` characters. */
export function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Make serialized markup a standalone SVG: drop the page's class names, the pointer cursor and the reveal
 * animations (their keyframes live in the page stylesheet and do not exist in an image).
 */
export function sanitizeSvg(markup: string): string {
  return markup
    .replace(/\sclass="[^"]*"/g, "")
    .replace(/\sstyle="([^"]*)"/g, (_match, css: string) => {
      // Only declarations inside style attributes are touched: text such as "cursor: x" in a place name stays.
      const kept = css
        .split(";")
        .map((declaration) => declaration.trim())
        .filter((declaration) => declaration && !/^(animation|cursor)\s*:/.test(declaration));
      return kept.length > 0 ? ` style="${kept.join(";")}"` : "";
    });
}
