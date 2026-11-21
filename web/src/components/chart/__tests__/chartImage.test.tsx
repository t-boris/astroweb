import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import i18next from "i18next";
import { ALL_ASPECT_TYPES, DEFAULT_ASPECT_TYPES, formatSignedOrb, pointGlyph } from "@astroweb/chart-core";
import NatalChart from "@/components/chart/NatalChart";
import { AspectMatrix } from "@/components/chart/AspectMatrix";
import { buildMatrixModel } from "@/components/chart/matrixModel";
import { buildWheelModel } from "@/components/chart/wheelModel";
import { ImageDownloadButton } from "@/components/chart/image/ImageDownloadButton";
import { buildMatrixImage, buildWheelImage } from "@/components/chart/image/buildImages";
import {
  FOOTER_HEIGHT,
  IMAGE_BG,
  SITE_URL,
  WHEEL_IMAGE_SIZE,
  composeFooterLines,
  cleanText,
  sanitizeSvg,
  truncate,
  wrapText,
  type ChartImage,
  type ChartImageContext,
} from "@/components/chart/image/imageCommon";
import { matrixImageSize } from "@/components/chart/image/matrixImageLayout";
import { IMAGE_WHEEL_LOOK, PAGE_WHEEL_LOOK } from "@/components/chart/wheelLook";
import {
  BLOB_URL_LIFETIME_MS,
  MAX_IMAGE_SIDE_PX,
  downloadSvgAsPng,
  rasterScale,
  runImageDownload,
  svgDataUrl,
  type ImageDownloadState,
  type RasterDeps,
} from "@/components/chart/image/rasterize";
import { pointLabel } from "@/components/chart/utils/labels";
import { charts, initI18n, tagsWith, textOf, type FixtureName } from "./tablesTestSupport";

beforeAll(async () => {
  await initI18n("en");
});

const CONTEXT: ChartImageContext = {
  birthDate: "1990-01-10",
  birthTime: "12:30",
  placeName: "Minneapolis, Minnesota, USA",
  relocated: false,
};

const t = () => i18next.getFixedT(i18next.language);

function footerFor(name: FixtureName, context: ChartImageContext = CONTEXT): string[] {
  return composeFooterLines(t(), i18next.language, charts[name], context);
}

async function wheelFor(name: FixtureName, filters: ReadonlySet<string> = new Set(DEFAULT_ASPECT_TYPES), showSymbols = true) {
  return buildWheelImage({
    chart: charts[name],
    activeFilters: filters,
    showSymbols,
    ariaLabel: t()("natalWheel.ariaLabel"),
    footerLines: footerFor(name),
  });
}

function matrixLabels() {
  const tt = t();
  return {
    title: tt("natalChart.matrix.title"),
    legend: tt("natalChart.matrix.legend"),
    ariaLabel: tt("natalChart.matrix.title"),
    pointLabel: (id: string) => pointLabel(tt, id),
    applyingShort: tt("natalChart.aspects.applyingShort"),
    separatingShort: tt("natalChart.aspects.separatingShort"),
  };
}

async function matrixFor(name: FixtureName, filters: ReadonlySet<string> = new Set(ALL_ASPECT_TYPES)) {
  return buildMatrixImage({
    chart: charts[name],
    activeFilters: filters,
    labels: matrixLabels(),
    footerLines: footerFor(name),
  });
}

/** The page's own wheel markup, for comparison with the image. */
const pageWheel = (name: FixtureName) => renderToStaticMarkup(<NatalChart chart={charts[name]} />);

describe("footer lines of the image", () => {
  it("names the birth date and time, the place and the house system the chart was calculated with", () => {
    expect(footerFor("C")).toEqual(["January 10, 1990 · 12:30", "Minneapolis, Minnesota, USA · Koch houses"]);
    expect(footerFor("A")[1]).toBe("Minneapolis, Minnesota, USA · Whole Sign houses");
    expect(footerFor("D")[1]).toBe("Minneapolis, Minnesota, USA · Placidus houses");
  });

  it("names the system that was actually used when the requested one fell back", () => {
    const info = charts.fallback.context;
    expect(info?.requestedHouseSystem).not.toBe(info?.usedHouseSystem);
    expect(footerFor("fallback")[1]).toContain(`${i18next.t(`houseAreas.houseSystemNames.${info?.usedHouseSystem === "whole-sign" ? "wholeSign" : info?.usedHouseSystem}`)} houses`);
  });

  it("says the time is unknown and names no house system for a noon estimate", () => {
    const lines = footerFor("unknownTime", { ...CONTEXT, birthTime: null });
    expect(lines).toEqual(["January 10, 1990 · time unknown, positions for local noon", "Minneapolis, Minnesota, USA"]);
    expect(lines.join(" ")).not.toMatch(/houses/i);
  });

  it("marks a relocation place and leaves the place out when there is none", () => {
    expect(footerFor("C", { ...CONTEXT, relocated: true })[1]).toContain("(relocated)");
    expect(footerFor("C", { ...CONTEXT, placeName: "" })).toEqual(["January 10, 1990 · 12:30", "Koch houses"]);
  });

  it("cuts a very long place name and carries no coordinates", () => {
    const long = footerFor("C", { ...CONTEXT, placeName: "A".repeat(120) });
    expect(long[1].split(" · ")[0].length).toBeLessThanOrEqual(46);
    expect(long[1]).toContain("…");
    expect(footerFor("C").join(" ")).not.toMatch(/\d+\.\d{2,}|°\s*[NSEW]\b/);
  });

  it("reads the date in the interface language", async () => {
    await initI18n("ru");
    const lines = footerFor("C");
    await initI18n("en");
    expect(lines).toEqual(["10 января 1990 г. · 12:30", "Minneapolis, Minnesota, USA · Дома: Кох"]);
  });
});

describe("wheel image (the page's wheel, standalone)", () => {
  it("is a standalone SVG with the site address printed once and the size it reports", async () => {
    const image = await wheelFor("C");
    expect(image.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(image.svg.match(new RegExp(SITE_URL.replace(/[.]/g, "\\."), "g"))).toHaveLength(1);
    const footerUrl = image.svg.match(/<text data-footer-field="url"[^>]*>([^<]*)<\/text>/);
    expect(footerUrl?.[1]).toBe("https://natalmystic.com");
    expect({ width: image.width, height: image.height }).toEqual(WHEEL_IMAGE_SIZE);
    expect(image.svg).toContain(`viewBox="0 0 ${image.width} ${image.height}"`);
    expect(image.svg).toContain(`width="${image.width}" height="${image.height}"`);
    expect(WHEEL_IMAGE_SIZE.height).toBeGreaterThan(WHEEL_IMAGE_SIZE.width);
    expect(WHEEL_IMAGE_SIZE.height - WHEEL_IMAGE_SIZE.width).toBeGreaterThanOrEqual(FOOTER_HEIGHT);
  });

  it("prints the footer lines under the wheel", async () => {
    const image = await wheelFor("C");
    const meta = [...image.svg.matchAll(/<text data-footer-field="meta"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
    expect(meta).toEqual(footerFor("C"));
  });

  it("draws every glyph, degree and layer of the page's wheel", async () => {
    for (const name of ["A", "C", "D", "fallback"] as const) {
      const image = await wheelFor(name);
      const page = pageWheel(name);
      const glyphs = (html: string) => [...html.matchAll(/<text data-field="glyph"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
      const degrees = (html: string) => [...html.matchAll(/<text data-field="degree"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
      expect(glyphs(image.svg).length).toBeGreaterThan(10);
      expect(glyphs(image.svg)).toEqual(glyphs(page));
      expect(degrees(image.svg)).toEqual(degrees(page));
      for (const layer of ["zodiac-ring", "degree-scale", "houses", "cusp-labels", "aspects", "angles", "points"]) {
        expect(image.svg).toContain(`data-layer="${layer}"`);
      }
      expect(tagsWith(image.svg, "text", "data-sign")).toHaveLength(12);
    }
  });

  it("draws the same aspect lines as the page for the same filters", async () => {
    const lines = (html: string) =>
      tagsWith(html, "line", "data-aspect-type").map((a) => `${a["data-aspect-a"]}|${a["data-aspect-b"]}|${a["data-aspect-type"]}`);
    const image = await wheelFor("C");
    expect(lines(image.svg)).toEqual(lines(pageWheel("C")));
    expect(lines(image.svg).length).toBeGreaterThan(0);
  });

  it("follows the active aspect filters", async () => {
    const lineCount = async (filters: string[]) => tagsWith((await wheelFor("C", new Set(filters))).svg, "line", "data-aspect-type").length;
    const model = (filters: string[]) => buildWheelModel(charts.C, new Set(filters)).segments.length;
    const majors = await lineCount(DEFAULT_ASPECT_TYPES);
    const all = await lineCount(ALL_ASPECT_TYPES);
    const none = await lineCount([]);
    expect(none).toBe(0);
    expect(majors).toBe(model(DEFAULT_ASPECT_TYPES));
    expect(all).toBe(model(ALL_ASPECT_TYPES));
    expect(all).toBeGreaterThan(majors);
    const trinesOnly = tagsWith((await wheelFor("C", new Set(["trine"]))).svg, "line", "data-aspect-type");
    expect(trinesOnly.length).toBeGreaterThan(0);
    expect(new Set(trinesOnly.map((a) => a["data-aspect-type"]))).toEqual(new Set(["trine"]));
  });

  it("shows the aspect symbols only when the page does", async () => {
    expect((await wheelFor("C", new Set(DEFAULT_ASPECT_TYPES), true)).svg).toContain("data-aspect-symbol");
    expect((await wheelFor("C", new Set(DEFAULT_ASPECT_TYPES), false)).svg).not.toContain("data-aspect-symbol");
  });

  it("has no event handlers, class names, animations or hover state", async () => {
    for (const name of ["C", "unknownTime"] as const) {
      const { svg } = await wheelFor(name);
      expect(svg).not.toMatch(/\son[a-z]+=/i);
      expect(svg).not.toMatch(/\sclass=/);
      expect(svg).not.toContain("animation");
      expect(svg).not.toContain("cursor");
      expect(svg).not.toContain('style=""');
      expect(svg).not.toContain("<script");
    }
  });

  it("draws no houses, cusp labels or angles for an unknown birth time", async () => {
    const { svg } = await wheelFor("unknownTime");
    // The inner circle stays, but there are no cusp lines, house numbers or cusp labels.
    expect(svg).not.toContain("data-house-cusp");
    expect(svg).not.toContain("data-house-number");
    expect(svg).not.toContain('data-layer="cusp-labels"');
    expect(svg).not.toContain('data-layer="angles"');
    expect(svg).toContain('data-layer="points"');
    expect(svg).toContain('data-layer="zodiac-ring"');
  });

  it("draws every layer in its revealed state, none left at zero opacity", async () => {
    const { svg } = await wheelFor("C");
    expect(svg).not.toMatch(/opacity:0(?![.\d])/);
  });
});

describe("matrix image (the table's cells, standalone)", () => {
  const cellsOfImage = (svg: string) =>
    tagsWith(svg, "g", "data-type").map((a) => `${a["data-a"]}|${a["data-b"]}|${a["data-type"]}|${a["data-orb"]}|${a["data-applying"]}|${a["data-major"]}`);
  const cellsOfTable = (html: string) =>
    tagsWith(html, "td", "data-type").map((a) => `${a["data-a"]}|${a["data-b"]}|${a["data-type"]}|${a["data-orb"]}|${a["data-applying"]}|${a["data-major"]}`);

  it("has the same cells, in the same order, as the table on the Aspects tab", async () => {
    for (const name of ["A", "B", "C", "D", "unknownTime", "fallback"] as const) {
      const image = await matrixFor(name);
      const table = renderToStaticMarkup(<AspectMatrix chart={charts[name]} />);
      expect(cellsOfImage(image.svg)).toEqual(cellsOfTable(table));
      expect(cellsOfImage(image.svg).length).toBeGreaterThan(0);
    }
  });

  it("draws the glyph, the signed orb and the applying or separating mark of every cell", async () => {
    const image = await matrixFor("C");
    const model = buildMatrixModel(charts.C, new Set(ALL_ASPECT_TYPES));
    const orbs = [...image.svg.matchAll(/<text data-cell-field="orb"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
    const expected = [...model.pairs.values()].length;
    expect(orbs).toHaveLength(expected);
    for (const orb of orbs) expect(orb).toMatch(/^[+−]?\d+°\d{2}′( [as])?$/);
    expect(orbs.some((o) => o.endsWith(" a"))).toBe(true);
    expect(orbs.some((o) => o.endsWith(" s"))).toBe(true);
    // Every aspect of the model appears with its formatted orb.
    for (const aspect of model.pairs.values()) expect(orbs.some((o) => o.startsWith(formatSignedOrb(aspect)))).toBe(true);
    expect([...image.svg.matchAll(/data-cell-field="glyph"/g)]).toHaveLength(expected);
  });

  it("has a header glyph per column, a named row per point and only the lower triangle of cells", async () => {
    const { svg } = await matrixFor("C");
    const model = buildMatrixModel(charts.C, new Set(ALL_ASPECT_TYPES));
    const columns = tagsWith(svg, "text", "data-column").map((a) => a["data-column"]);
    expect(columns).toEqual(model.columns.map((p) => p.id));
    const rows = tagsWith(svg, "g", "data-row").map((a) => a["data-row"]);
    expect(rows).toEqual(model.rows.map((p) => p.id));
    const text = textOf(svg);
    for (const row of model.rows) expect(text).toContain(pointLabel(t(), row.id));
    for (const point of model.columns) expect(svg).toContain(`>${pointGlyph(point.id)}</text>`);
    // A row only holds the cells of the points before it: no aspect appears above the diagonal.
    const order = new Map<string, number>(model.points.map((p, index) => [p.id, index]));
    const blocks = [...svg.matchAll(/<g data-row="(\w+)">([\s\S]*?)(?=<g data-row="|<text data-matrix-legend|<g data-image-footer)/g)];
    expect(blocks).toHaveLength(model.rows.length);
    let cells = 0;
    for (const [, rowId, body] of blocks) {
      for (const cell of tagsWith(body, "g", "data-type")) {
        const other = cell["data-a"] === rowId ? cell["data-b"] : cell["data-a"];
        expect([cell["data-a"], cell["data-b"]]).toContain(rowId);
        expect(order.get(other) as number).toBeLessThan(order.get(rowId) as number);
        cells += 1;
      }
    }
    expect(cells).toBe(model.pairs.size);
  });

  it("follows the active aspect filters and keeps minor aspects dashed", async () => {
    const all = cellsOfImage((await matrixFor("C")).svg);
    const majors = cellsOfImage((await matrixFor("C", new Set(DEFAULT_ASPECT_TYPES))).svg);
    expect(majors.length).toBeLessThan(all.length);
    expect(majors.every((cell) => cell.endsWith("|true"))).toBe(true);
    const full = (await matrixFor("C")).svg;
    expect(full).toContain('stroke-dasharray="6 4"');
    expect((await matrixFor("C", new Set(DEFAULT_ASPECT_TYPES))).svg).not.toContain('stroke-dasharray="6 4"');
    expect(cellsOfImage((await matrixFor("C", new Set())).svg)).toHaveLength(0);
  });

  it("carries the title, the legend, the site address and the footer lines, and reports its size", async () => {
    const image = await matrixFor("C");
    const tt = t();
    expect(image.svg).toContain(`>${tt("natalChart.matrix.title")}</text>`);
    expect(textOf(image.svg)).toContain("a = applying, s = separating.");
    expect(image.svg.match(/https:\/\/natalmystic\.com/g)).toHaveLength(1);
    const meta = [...image.svg.matchAll(/<text data-footer-field="meta"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
    expect(meta).toEqual(footerFor("C"));
    const model = buildMatrixModel(charts.C, new Set(ALL_ASPECT_TYPES));
    const legendLines = [...image.svg.matchAll(/data-matrix-legend/g)].length;
    expect({ width: image.width, height: image.height }).toEqual(matrixImageSize(model.columns.length, model.rows.length, legendLines));
    expect(image.svg).toContain(`viewBox="0 0 ${image.width} ${image.height}"`);
  });

  it("has no event handlers, class names or scripts", async () => {
    const { svg } = await matrixFor("C");
    expect(svg).not.toMatch(/\son[a-z]+=/i);
    expect(svg).not.toMatch(/\sclass=/);
    expect(svg).not.toContain("<script");
  });

  it("reads in Russian", async () => {
    await initI18n("ru");
    const image = await matrixFor("C");
    await initI18n("en");
    expect(image.svg).toContain("Матрица аспектов");
    expect(image.svg).toContain("Луна");
    expect(image.svg).toContain("https://natalmystic.com");
  });
});

describe("helpers", () => {
  it("wraps text at spaces and drops nothing", () => {
    const lines = wrapText("one two three four five six", 10);
    expect(lines.every((l) => l.length <= 10)).toBe(true);
    expect(lines.join(" ")).toBe("one two three four five six");
    expect(wrapText("", 10)).toEqual([]);
  });

  it("strips classes, cursors and animations from serialized markup", () => {
    const markup = '<g class="a b" style="animation:x 1s;cursor:pointer;opacity:0.5"><circle style="cursor:pointer"/></g>';
    expect(sanitizeSvg(markup)).toBe('<g style="opacity:0.5"><circle/></g>');
  });

  it("keeps text that looks like a style declaration, and only drops animation and cursor from style attributes", () => {
    const markup = '<text>Hotel cursor: Paris, animation: x</text><g style="cursor:pointer;opacity:1"/>';
    expect(sanitizeSvg(markup)).toBe('<text>Hotel cursor: Paris, animation: x</text><g style="opacity:1"/>');
  });
});

describe("free text in the footer", () => {
  it("cuts a long place by characters, never inside a surrogate pair", () => {
    const place = `${"a".repeat(44)}😀😀😀`;
    const cut = truncate(place, 46);
    expect([...cut]).toHaveLength(46);
    expect(cut.endsWith("…")).toBe(true);
    expect(() => encodeURIComponent(cut)).not.toThrow();
    expect(truncate("short", 46)).toBe("short");
  });

  it("drops characters XML does not allow and replaces a lone surrogate", () => {
    expect(cleanText("Par\u0000is\u0008 \u000B\u001F\uFFFE")).toBe("Paris ");
    expect(cleanText("tab\tline\nbreak")).toBe("tab\tline\nbreak");
    expect(cleanText("x\uD83Dy")).toBe("x\uFFFDy");
    expect(() => encodeURIComponent(cleanText("x\uD83Dy\u0001"))).not.toThrow();
  });

  it("keeps the word relocated when the place name is long", () => {
    const lines = composeFooterLines(t(), i18next.language, charts.C, { ...CONTEXT, placeName: "P".repeat(80), relocated: true });
    expect(lines[1]).toContain("relocated");
    expect(lines[1]).toContain("…");
  });

  it("escapes markup in the place name in the finished SVG and keeps it a well-formed image", async () => {
    const place = '<script>alert("x")</script> & O\'Hare';
    const lines = composeFooterLines(t(), i18next.language, charts.C, { ...CONTEXT, placeName: place });
    const image = await buildWheelImage({
      chart: charts.C,
      activeFilters: new Set(DEFAULT_ASPECT_TYPES),
      showSymbols: true,
      ariaLabel: "wheel",
      footerLines: lines,
    });
    expect(image.svg).not.toContain("<script");
    expect(image.svg).toContain("&lt;script&gt;");
    expect(image.svg).toContain("&amp;");
    expect(() => encodeURIComponent(image.svg)).not.toThrow();
  });
});

describe("download", () => {
  const IMAGE: ChartImage = { svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>https://natalmystic.com</text></svg>', width: 1040, height: 1216 };

  function fakeDeps(overrides: Partial<RasterDeps> = {}) {
    const calls = {
      drawn: [] as number[][],
      canvas: [] as number[],
      downloaded: [] as Array<{ url: string; fileName: string }>,
      revoked: [] as string[],
      loaded: [] as string[],
      deferred: [] as Array<{ callback: () => void; ms: number }>,
    };
    const deps: RasterDeps = {
      loadImage: async (src) => {
        calls.loaded.push(src);
        return { decoded: true };
      },
      createCanvas: (width, height) => {
        calls.canvas.push(width, height);
        return {
          getContext: () => ({ drawImage: (_image, dx, dy, dw, dh) => calls.drawn.push([dx, dy, dw, dh]) }),
          toBlob: (callback) => callback(new Blob(["png"], { type: "image/png" })),
        };
      },
      createObjectURL: () => "blob:fake-url",
      revokeObjectURL: (url) => calls.revoked.push(url),
      defer: (callback, ms) => calls.deferred.push({ callback, ms }),
      download: (url, fileName) => calls.downloaded.push({ url, fileName }),
      ...overrides,
    };
    return { deps, calls };
  }

  it("draws the SVG at the maximum size and downloads the PNG under the given name", async () => {
    const { deps, calls } = fakeDeps();
    await downloadSvgAsPng(IMAGE, "natal-chart.png", deps);
    // The longer side (1216 units) becomes MAX_IMAGE_SIDE_PX pixels.
    expect(calls.canvas).toEqual([2737, MAX_IMAGE_SIDE_PX]);
    expect(calls.drawn).toEqual([[0, 0, 2737, MAX_IMAGE_SIDE_PX]]);
    expect(calls.loaded).toHaveLength(1);
    expect(calls.loaded[0]).toBe(svgDataUrl(IMAGE.svg));
    expect(decodeURIComponent(calls.loaded[0].replace("data:image/svg+xml;charset=utf-8,", ""))).toBe(IMAGE.svg);
    expect(calls.downloaded).toEqual([{ url: "blob:fake-url", fileName: "natal-chart.png" }]);
    // The URL stays valid while the browser starts the download, then is released.
    expect(calls.revoked).toEqual([]);
    expect(calls.deferred).toHaveLength(1);
    expect(calls.deferred[0].ms).toBe(BLOB_URL_LIFETIME_MS);
    calls.deferred[0].callback();
    expect(calls.revoked).toEqual(["blob:fake-url"]);
  });

  it("renders every image at the maximum size: the longer side is MAX_IMAGE_SIDE_PX pixels", () => {
    for (const [width, height] of [
      [WHEEL_IMAGE_SIZE.width, WHEEL_IMAGE_SIZE.height],
      [1738, 1482],
      [4000, 100],
      [600, 600],
    ]) {
      const scale = rasterScale(width, height);
      expect(Math.round(Math.max(width, height) * scale)).toBe(MAX_IMAGE_SIDE_PX);
      expect(Math.round(Math.min(width, height) * scale)).toBeLessThanOrEqual(MAX_IMAGE_SIDE_PX);
    }
    expect(rasterScale(WHEEL_IMAGE_SIZE.width, WHEEL_IMAGE_SIZE.height)).toBeGreaterThan(2);
  });

  it("fails without a download when the image cannot be decoded", async () => {
    const { deps, calls } = fakeDeps({ loadImage: async () => Promise.reject(new Error("decode")) });
    await expect(downloadSvgAsPng(IMAGE, "x.png", deps)).rejects.toThrow("decode");
    expect(calls.downloaded).toEqual([]);
    expect(calls.revoked).toEqual([]);
  });

  it("fails without a download when the canvas has no 2D context or cannot encode a PNG", async () => {
    const noContext = fakeDeps({ createCanvas: () => ({ getContext: () => null, toBlob: () => {} }) });
    await expect(downloadSvgAsPng(IMAGE, "x.png", noContext.deps)).rejects.toThrow("2D canvas");
    const noBlob = fakeDeps({
      createCanvas: () => ({ getContext: () => ({ drawImage: () => {} }), toBlob: (callback) => callback(null) }),
    });
    await expect(downloadSvgAsPng(IMAGE, "x.png", noBlob.deps)).rejects.toThrow("PNG");
    expect(noContext.calls.downloaded).toEqual([]);
    expect(noBlob.calls.downloaded).toEqual([]);
  });

  it("revokes the object URL at once when starting the download throws", async () => {
    const { deps, calls } = fakeDeps({
      download: () => {
        throw new Error("blocked");
      },
    });
    await expect(downloadSvgAsPng(IMAGE, "x.png", deps)).rejects.toThrow("blocked");
    expect(calls.revoked).toEqual(["blob:fake-url"]);
    expect(calls.deferred).toEqual([]);
  });

  describe("button state", () => {
    beforeEach(() => {
      vi.spyOn(console, "error").mockImplementation(() => {});
    });

    it("goes busy, then idle, after a successful download", async () => {
      const { deps, calls } = fakeDeps();
      const states: ImageDownloadState[] = [];
      await runImageDownload(async () => IMAGE, "natal-chart-aspects.png", (s) => states.push(s), deps);
      expect(states).toEqual(["busy", "idle"]);
      expect(calls.downloaded[0].fileName).toBe("natal-chart-aspects.png");
    });

    it("ends in the error state when building or drawing fails, and does not download", async () => {
      const { deps, calls } = fakeDeps({ loadImage: async () => Promise.reject(new Error("decode")) });
      const states: ImageDownloadState[] = [];
      await runImageDownload(async () => IMAGE, "x.png", (s) => states.push(s), deps);
      expect(states).toEqual(["busy", "error"]);
      const failedBuild: ImageDownloadState[] = [];
      await runImageDownload(() => Promise.reject(new Error("build")), "x.png", (s) => failedBuild.push(s), fakeDeps().deps);
      expect(failedBuild).toEqual(["busy", "error"]);
      expect(calls.downloaded).toEqual([]);
    });
  });
});

describe("download buttons on the page", () => {
  const noImage = () => Promise.reject(new Error("not used"));

  it("labels the button for each image in English and Russian", async () => {
    const wheel = renderToStaticMarkup(<ImageDownloadButton kind="wheel" build={noImage} />);
    const matrix = renderToStaticMarkup(<ImageDownloadButton kind="matrix" build={noImage} />);
    expect(textOf(wheel)).toBe("Download wheel image");
    expect(textOf(matrix)).toBe("Download matrix image");
    // The accessible name is the visible text (WCAG 2.5.3); the longer description is a tooltip.
    expect(wheel).not.toContain("aria-label");
    expect(wheel).toContain('title="Download the natal chart wheel as a PNG image with the site address"');
    expect(matrix).toContain('title="Download the aspect matrix as a PNG image with the site address"');
    expect(wheel).toContain('type="button"');
    expect(wheel).toContain('aria-disabled="false"');
    expect(wheel).not.toContain('disabled=""');
    expect(wheel).not.toContain('role="alert"');
    await initI18n("ru");
    const ru = renderToStaticMarkup(<ImageDownloadButton kind="wheel" build={noImage} />);
    await initI18n("en");
    expect(textOf(ru)).toBe("Скачать картинку карты");
  });

  it("is next to the aspect filters of the wheel and above the matrix, only when the page gives the birth data", () => {
    const withContext = renderToStaticMarkup(<NatalChart chart={charts.C} imageContext={CONTEXT} />);
    expect(tagsWith(withContext, "button", "data-image-download")).toHaveLength(1);
    expect(withContext.indexOf("data-aspect-filter")).toBeLessThan(withContext.indexOf("data-image-download"));
    expect(renderToStaticMarkup(<NatalChart chart={charts.C} />)).not.toContain("data-image-download");

    const matrix = renderToStaticMarkup(<AspectMatrix chart={charts.C} imageContext={CONTEXT} />);
    expect(tagsWith(matrix, "button", "data-image-download").map((b) => b["data-image-download"])).toEqual(["matrix"]);
    expect(matrix.indexOf("data-image-download")).toBeLessThan(matrix.indexOf("<table"));
    expect(matrix.indexOf("data-aspect-filter")).toBeLessThan(matrix.indexOf("data-image-download"));
    expect(renderToStaticMarkup(<AspectMatrix chart={charts.C} />)).not.toContain("data-image-download");
  });

  it("has English and Russian texts for every key the buttons and the footer use", () => {
    const keys = [
      "chartImage.download.wheel",
      "chartImage.download.wheelAria",
      "chartImage.download.matrix",
      "chartImage.download.matrixAria",
      "chartImage.download.busy",
      "chartImage.download.error",
      "chartImage.footer.houses",
      "chartImage.footer.timeUnknown",
    ];
    for (const lng of ["en", "ru"]) {
      const tt = i18next.getFixedT(lng);
      for (const key of keys) expect(tt(key, { system: "X" }), `${lng} ${key}`).not.toBe(key);
    }
  });
});

describe("look of the image: lighter background, visible dividing lines", () => {
  it("draws the image with the stronger look and leaves the page wheel on its own look", async () => {
    const cuspOne = (markup: string) => markup.match(/<line[^>]*data-house-cusp="1"[^>]*>/)?.[0] ?? "";
    const image = (await wheelFor("C")).svg;
    expect(cuspOne(image)).toContain(`stroke="${IMAGE_WHEEL_LOOK.cuspStroke}"`);
    expect(cuspOne(image)).toContain(`stroke-width="${IMAGE_WHEEL_LOOK.cuspWidth}"`);
    expect(image).toContain(`stop-color="${IMAGE_WHEEL_LOOK.discCenter}"`);
    expect(image).not.toContain(`stop-color="${PAGE_WHEEL_LOOK.discCenter}"`);
    const page = pageWheel("C");
    expect(cuspOne(page)).toContain(`stroke="${PAGE_WHEEL_LOOK.cuspStroke}"`);
    expect(cuspOne(page)).toContain(`stroke-width="${PAGE_WHEEL_LOOK.cuspWidth}"`);
    expect(page).toContain(`stop-color="${PAGE_WHEEL_LOOK.discCenter}"`);
    expect(page).not.toContain(`stop-color="${IMAGE_WHEEL_LOOK.discCenter}"`);
  });

  it("makes every dividing line of the image stronger than on the page", () => {
    const alpha = (rgba: string) => Number(rgba.match(/([\d.]+)\)$/)![1]);
    expect(alpha(IMAGE_WHEEL_LOOK.cuspStroke)).toBeGreaterThanOrEqual(0.5);
    expect(alpha(IMAGE_WHEEL_LOOK.cuspStroke)).toBeGreaterThan(alpha(PAGE_WHEEL_LOOK.cuspStroke));
    expect(alpha(IMAGE_WHEEL_LOOK.houseRingStroke)).toBeGreaterThan(alpha(PAGE_WHEEL_LOOK.houseRingStroke));
    expect(alpha(IMAGE_WHEEL_LOOK.outerRingStroke)).toBeGreaterThan(alpha(PAGE_WHEEL_LOOK.outerRingStroke));
    expect(alpha(IMAGE_WHEEL_LOOK.innerCircleStroke)).toBeGreaterThan(alpha(PAGE_WHEEL_LOOK.innerCircleStroke));
    expect(IMAGE_WHEEL_LOOK.sectorStrokeOpacity).toBeGreaterThanOrEqual(0.7);
    expect(IMAGE_WHEEL_LOOK.cuspWidth).toBeGreaterThan(PAGE_WHEEL_LOOK.cuspWidth);
  });

  it("uses a background lighter than the page's own", async () => {
    const lightness = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255);
    };
    expect(IMAGE_BG).not.toBe("#070a14");
    expect(lightness(IMAGE_BG)).toBeGreaterThan(lightness("#070a14") * 2);
    expect(lightness(IMAGE_WHEEL_LOOK.discCenter)).toBeGreaterThan(lightness(PAGE_WHEEL_LOOK.discCenter) * 2);
    expect((await wheelFor("C")).svg).toContain(`fill="${IMAGE_BG}"`);
    expect((await matrixFor("C")).svg).toContain(`fill="${IMAGE_BG}"`);
  });
});
