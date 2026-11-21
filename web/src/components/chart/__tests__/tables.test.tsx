import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ChartResult, SharedAspect } from "@/types";
import { PlanetsTable } from "@/components/chart/PlanetsTable";
import { AspectsList, AspectsTable } from "@/components/chart/AspectsTable";
import { AspectMatrix } from "@/components/chart/AspectMatrix";
import {
  ALL_ASPECT_TYPES,
  DEFAULT_ASPECT_TYPES,
  filterAspects,
  getSharedAspects,
  aspectPairKey,
  formatSignedOrb,
  getAnalysisPoints,
} from "@astroweb/chart-core";
import { RAW_KEY, charts, initI18n, positionRows, tagsWith, textOf } from "./tablesTestSupport";

beforeAll(async () => {
  await initI18n("en");
});

const render = (node: React.ReactElement) => renderToStaticMarkup(node);

/** Table rows of a chart as [sign, degree, house, retrograde] per point id. */
function rowsOf(chart: ChartResult) {
  const rows = positionRows(render(<PlanetsTable chart={chart} />));
  // The sign cell starts with the zodiac glyph; the tests compare the sign name.
  return Object.fromEntries(
    Object.entries(rows).map(([id, cells]) => [id, cells.slice(1).map((cell) => cell.replace(/^[\u2648-\u2653]\s*/, ""))]),
  );
}

describe("position table (REQ-002)", () => {
  it("lists the ten bodies, the extra points and ASC and MC in order", () => {
    const rows = positionRows(render(<PlanetsTable chart={charts.A} />));
    expect(Object.keys(rows)).toEqual([
      "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
      "NorthNode", "SouthNode", "Lilith", "Chiron", "Fortune", "Vertex", "ASC", "MC",
    ]);
  });

  it("reproduces the rows of the Astro-Seek screenshot SRC-002 (chart A) with truncated minutes", () => {
    // [sign, degree, house, retrograde] as printed in the screenshot table; Fortune and Vertex are not in that screenshot.
    const expected: Record<string, string[]> = {
      Sun: ["Aries", "9°10′", "3", ""],
      Moon: ["Libra", "27°35′", "9", ""],
      Mercury: ["Aries", "0°50′", "3", ""],
      Venus: ["Aries", "27°16′", "3", ""],
      Mars: ["Taurus", "19°55′", "4", ""],
      Jupiter: ["Cancer", "6°54′", "6", ""],
      Saturn: ["Gemini", "10°15′", "5", ""],
      Uranus: ["Aquarius", "27°12′", "1", ""],
      Neptune: ["Aquarius", "10°27′", "1", ""],
      Pluto: ["Sagittarius", "17°36′", "11", "R"],
      NorthNode: ["Gemini", "21°41′", "5", "R"],
      Lilith: ["Pisces", "24°33′", "2", ""],
      Chiron: ["Capricorn", "8°54′", "12", ""],
      ASC: ["Aquarius", "24°58′", "1", "—"],
      MC: ["Scorpio", "20°37′", "10", "—"],
    };
    const rows = rowsOf(charts.A);
    for (const [id, cells] of Object.entries(expected)) expect(rows[id], id).toEqual(cells);
  });

  it("reproduces the rows of the Astro-Seek screenshot SRC-003 (chart B) including Fortune and Vertex", () => {
    const expected: Record<string, string[]> = {
      Sun: ["Libra", "1°40′", "1", ""],
      Moon: ["Pisces", "28°09′", "6", ""],
      Mercury: ["Libra", "14°33′", "1", ""],
      Venus: ["Leo", "22°19′", "11", ""],
      Mars: ["Sagittarius", "14°38′", "3", ""],
      Jupiter: ["Taurus", "3°25′", "8", "R"],
      Saturn: ["Taurus", "16°35′", "8", "R"],
      Uranus: ["Aquarius", "13°10′", "5", "R"],
      Neptune: ["Aquarius", "1°41′", "5", "R"],
      Pluto: ["Sagittarius", "8°06′", "3", ""],
      NorthNode: ["Leo", "10°14′", "11", "R"],
      Lilith: ["Sagittarius", "12°30′", "3", ""],
      Chiron: ["Sagittarius", "0°15′", "3", ""],
      Fortune: ["Aries", "20°12′", "7", "—"],
      Vertex: ["Cancer", "5°19′", "10", "—"],
      ASC: ["Libra", "23°43′", "1", "—"],
      MC: ["Cancer", "24°19′", "10", "—"],
    };
    const rows = rowsOf(charts.B);
    for (const [id, cells] of Object.entries(expected)) expect(rows[id], id).toEqual(cells);
  });

  it("shows the South Node as a retrograde mirror of the North Node", () => {
    const rows = rowsOf(charts.B);
    expect(rows.SouthNode).toEqual(["Aquarius", "10°14′", "5", "R"]);
  });

  it("gives ASC and MC the house of their longitude in Koch and Placidus too", () => {
    for (const chart of [charts.C, charts.D]) {
      const rows = rowsOf(chart);
      expect(rows.ASC[2], "ASC house").toBe("1");
      expect(rows.MC[2], "MC house").toBe("10");
    }
  });

  it("leaves a direct body's retrograde cell empty and marks the R with an accessible label", () => {
    const html = render(<PlanetsTable chart={charts.A} />);
    expect(html).toContain('aria-label="Retrograde"');
    const sun = html.match(/<tr data-point="Sun">[\s\S]*?<\/tr>/)![0];
    expect(sun).toContain('data-retrograde="false"');
    expect(sun).not.toContain("<abbr");
  });

  it("shows em dashes instead of houses and no ASC or MC for an unknown birth time", () => {
    const html = render(<PlanetsTable chart={charts.unknownTime} />);
    const rows = positionRows(html);
    expect(Object.keys(rows)).not.toContain("ASC");
    expect(Object.keys(rows)).not.toContain("MC");
    expect(Object.keys(rows)).not.toContain("Fortune");
    expect(Object.keys(rows)).not.toContain("Vertex");
    expect(Object.keys(rows)).toHaveLength(14);
    for (const cells of Object.values(rows)) expect(cells[3], "house cell").toBe("—");
    expect(textOf(html)).toContain("The birth time is unknown, so the positions are calculated for local noon.");
  });

  it("does not say anything about an estimate when the birth time is known", () => {
    expect(textOf(render(<PlanetsTable chart={charts.A} />))).not.toContain("local noon");
  });

  it("uses the same sign, degree and house for a point as the shared position values", () => {
    // The wheel reads getPositions() through the same helpers, so a row must equal the raw position it came from.
    const rows = rowsOf(charts.D);
    for (const p of charts.D.positions!) {
      expect(rows[p.id][0], `${p.id} sign`).toBe(p.sign);
      expect(rows[p.id][2], `${p.id} house`).toBe(String(p.house));
    }
  });

  it("renders every label in Russian without leaking translation keys", async () => {
    await initI18n("ru");
    const html = render(<PlanetsTable chart={charts.A} />);
    await initI18n("en");
    const text = textOf(html);
    expect(text).toContain("Северный узел");
    expect(text).toContain("Чёрная Луна (Лилит)");
    expect(text).toContain("Колесо Фортуны");
    expect(text).toContain("Асцендент");
    expect(text).toContain("Середина неба");
    expect(text).toContain("Водолей");
    expect(html).not.toMatch(RAW_KEY);
  });
});

// ---- Aspects ------------------------------------------------------------------------------------

type Row = { a: string; b: string; type: string; major: string; orb: string; applying: string };

function listRows(html: string): Row[] {
  return tagsWith(html, "tr", "data-type").map((t) => ({
    a: t["data-a"], b: t["data-b"], type: t["data-type"], major: t["data-major"], orb: t["data-orb"], applying: t["data-applying"],
  }));
}

function matrixCells(html: string): Row[] {
  return tagsWith(html, "td", "data-type").map((t) => ({
    a: t["data-a"], b: t["data-b"], type: t["data-type"], major: t["data-major"], orb: t["data-orb"], applying: t["data-applying"],
  }));
}

function expectedRow(aspect: SharedAspect): Row {
  return {
    a: aspect.a,
    b: aspect.b,
    type: aspect.type,
    major: String(aspect.major),
    orb: aspect.signedOrb.toFixed(4),
    applying: aspect.applying === null ? "none" : String(aspect.applying),
  };
}

const MIRRORS = new Set(["DSC", "IC"]);

describe.each(["A", "B"] as const)("one shared aspect set across list, matrix and wheel, chart %s (REQ-003)", (name) => {
  const chart = charts[name];
  const wheelSet = filterAspects(getSharedAspects(chart), new Set(ALL_ASPECT_TYPES));

  it("the list with every filter on shows exactly the shared set, in its order", () => {
    const rows = listRows(render(<AspectsList aspects={wheelSet} />));
    expect(rows).toEqual(wheelSet.map(expectedRow));
    expect(rows.length).toBeGreaterThan(40);
  });

  it("the matrix, opened with every type visible, shows each pair of the table points once with the same values", () => {
    const cells = matrixCells(render(<AspectMatrix chart={chart} />));
    const inMatrix = wheelSet.filter((a) => !MIRRORS.has(a.a) && !MIRRORS.has(a.b));
    expect(cells).toHaveLength(inMatrix.length);

    const byPair = new Map(cells.map((c) => [aspectPairKey(c.a, c.b), c]));
    expect(byPair.size).toBe(cells.length);
    for (const aspect of inMatrix) {
      expect(byPair.get(aspectPairKey(aspect.a, aspect.b)), `${aspect.a} ${aspect.type} ${aspect.b}`).toEqual(expectedRow(aspect));
    }
  });

  it("every matrix cell has the same pair, type, orb and applying marker as the list row", () => {
    const rows = new Map(listRows(render(<AspectsList aspects={wheelSet} />)).map((r) => [aspectPairKey(r.a, r.b), r]));
    for (const cell of matrixCells(render(<AspectMatrix chart={chart} />))) {
      expect(cell).toEqual(rows.get(aspectPairKey(cell.a, cell.b)));
    }
  });

  it("aspects to DSC and IC are only in the list; the South Node is in neither", () => {
    const mirrored = wheelSet.filter((a) => MIRRORS.has(a.a) || MIRRORS.has(a.b));
    expect(mirrored.length).toBeGreaterThan(0);
    const cells = matrixCells(render(<AspectMatrix chart={chart} />));
    expect(cells.filter((c) => MIRRORS.has(c.a) || MIRRORS.has(c.b))).toEqual([]);
    expect(listRows(render(<AspectsList aspects={wheelSet} />)).filter((r) => MIRRORS.has(r.a) || MIRRORS.has(r.b))).toHaveLength(mirrored.length);
    expect(wheelSet.some((a) => a.a === "SouthNode" || a.b === "SouthNode")).toBe(false);
  });

  it("prints the orb with its sign and the applying or separating marker the cell data says", () => {
    const html = render(<AspectMatrix chart={chart} />);
    const inMatrix = getSharedAspects(chart).filter((a) => !MIRRORS.has(a.a) && !MIRRORS.has(a.b));
    for (const aspect of inMatrix) {
      const cellHtml = html.match(
        new RegExp(`<td\\b[^>]*data-a="${aspect.a}" data-b="${aspect.b}" data-type="${aspect.type}"[^>]*>([\\s\\S]*?)</td>`),
      )![1];
      const text = textOf(cellHtml);
      expect(text, `${aspect.a} ${aspect.type} ${aspect.b}`).toContain(formatSignedOrb(aspect));
      if (aspect.applying === null) expect(text).not.toMatch(/[as]$/);
      else expect(text.endsWith(aspect.applying ? "a" : "s")).toBe(true);
    }
  });

  it("the list opens with the major aspects, a subset whose rows equal the full set's rows", () => {
    const full = listRows(render(<AspectsList aspects={wheelSet} />));
    const opened = listRows(render(<AspectsTable chart={chart} />));
    const majors = full.filter((r) => (DEFAULT_ASPECT_TYPES as string[]).includes(r.type));
    expect(opened).toEqual(majors);
    expect(opened.length).toBeLessThan(full.length);
    expect(opened.every((r) => r.major === "true")).toBe(true);
    expect(full.some((r) => r.major === "false")).toBe(true);
  });

  it("filters only hide aspects: the calculated set is the same whatever is visible", () => {
    const shared = getSharedAspects(chart);
    const before = JSON.stringify(shared);
    for (const types of [[...DEFAULT_ASPECT_TYPES], ["quincunx"], [], [...ALL_ASPECT_TYPES]]) {
      const visible = filterAspects(shared, new Set(types));
      expect(visible.every((a) => types.includes(a.type))).toBe(true);
      expect(visible).toEqual(shared.filter((a) => types.includes(a.type)));
      // every visible aspect is the very same object, not a recalculated one
      for (const aspect of visible) expect(shared).toContain(aspect);
    }
    expect(JSON.stringify(shared)).toBe(before);
    expect(filterAspects(shared, new Set(ALL_ASPECT_TYPES))).toHaveLength(shared.length);
  });
});

describe("aspect list and matrix presentation", () => {
  it("the matrix points are the table points without the South Node and the table has ASC and MC rows", () => {
    const ids = getAnalysisPoints(charts.B).map((p) => p.id);
    expect(ids).not.toContain("SouthNode");
    expect(ids.slice(-2)).toEqual(["ASC", "MC"]);
    expect(ids).toHaveLength(17);
  });

  it("is horizontally scrollable and marks major and minor aspects differently", () => {
    const html = render(<AspectMatrix chart={charts.A} />);
    expect(html).toContain("overflow-x-auto");
    const cells = tagsWith(html, "td", "data-type");
    const major = cells.find((c) => c["data-major"] === "true")!;
    const minor = cells.find((c) => c["data-major"] === "false")!;
    expect(major["style"]).toContain("border-style:solid");
    expect(minor["style"]).toContain("border-style:dashed");
  });

  it("a matrix cell carries an accessible description of the aspect", () => {
    const html = render(<AspectMatrix chart={charts.A} />);
    // Venus sextile Uranus, orb 0°03′, separating (the most exact aspect of chart A)
    expect(html).toContain('aria-label="Venus Sextile Uranus, Orb +0°03′, Separating"');
  });

  it("shows the unknown-time chart without any ASC, MC, DSC or IC aspects", () => {
    const chart = charts.unknownTime;
    const list = listRows(render(<AspectsList aspects={filterAspects(getSharedAspects(chart), new Set(ALL_ASPECT_TYPES))} />));
    expect(list.length).toBeGreaterThan(0);
    expect(list.some((r) => ["ASC", "MC", "DSC", "IC"].some((id) => r.a === id || r.b === id))).toBe(false);
    const html = render(<AspectMatrix chart={chart} />);
    expect(tagsWith(html, "th", "data-point").map((t) => t["data-point"])).not.toContain("ASC");
    expect(tagsWith(html, "th", "data-point").map((t) => t["data-point"])).not.toContain("MC");
  });

  it("renders the aspect list and the matrix in Russian without leaking translation keys", async () => {
    await initI18n("ru");
    const html = render(
      <>
        <AspectsTable chart={charts.B} />
        <AspectMatrix chart={charts.B} />
      </>,
    );
    await initI18n("en");
    const text = textOf(html);
    expect(text).toContain("Матрица аспектов");
    expect(text).toContain("Сходящийся");
    expect(text).toContain("Соединение");
    expect(text).toContain("Квинконс");
    expect(html).not.toMatch(RAW_KEY);
  });
});
