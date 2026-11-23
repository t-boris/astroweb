import { CHART_LAYOUT } from "@astroweb/chart-core";

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

/**
 * Language of every text in a downloaded image. The pictures are made to be shared, so they read the same for
 * everyone, whatever the language of the interface that made them.
 */
export const IMAGE_LANGUAGE = "en";

/** Height of the band under the chart: one small line with the caption on the left and the address on the right. */
export const FOOTER_HEIGHT = 56;

/** Distance of the footer texts from the left and right edge of the image. */
export const FOOTER_INSET = 40;

/** Size of the footer texts: small next to the chart, still readable on the full-size picture. */
export const FOOTER_FONT_SIZE = 18;

/** Empty border around the wheel disc in the wheel image: as small as it can be, so the chart fills the picture. */
export const WHEEL_IMAGE_MARGIN = 6;

/** Size of the wheel image in SVG units: the wheel with its margin, then the footer. */
export const WHEEL_IMAGE_SIZE = {
  width: CHART_LAYOUT.size + 2 * WHEEL_IMAGE_MARGIN,
  height: CHART_LAYOUT.size + 2 * WHEEL_IMAGE_MARGIN + FOOTER_HEIGHT,
};

export type ImageKind = "wheel" | "matrix";

/** What each picture is and where it comes from, printed small in its bottom left corner. Nothing else about the chart is printed. */
export const IMAGE_CAPTIONS: Record<ImageKind, string> = {
  wheel: "Natal chart wheel · made with NatalMystic",
  matrix: "Natal chart aspect matrix · made with NatalMystic",
};

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
      // Only declarations inside style attributes are touched: text such as "cursor: x" in a label stays.
      const kept = css
        .split(";")
        .map((declaration) => declaration.trim())
        .filter((declaration) => declaration && !/^(animation|cursor)\s*:/.test(declaration));
      return kept.length > 0 ? ` style="${kept.join(";")}"` : "";
    });
}
