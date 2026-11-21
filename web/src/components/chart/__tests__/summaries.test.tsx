import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ElementModalityGrid } from "@/components/chart/ElementModalityGrid";
import { DegreeStrip } from "@/components/chart/DegreeStrip";
import { PlanetsTable } from "@/components/chart/PlanetsTable";
import {
  ELEMENTS,
  MODALITIES,
  getAnalysisPoints,
  groupByElementModality,
  layoutDegreeStrip,
  type Element,
  type Modality,
} from "@/components/chart/utils/viewModel";
import { RAW_KEY, charts, initI18n, positionRows, tagsWith, textOf } from "./tablesTestSupport";

beforeAll(async () => {
  await initI18n("en");
});

const render = (node: React.ReactElement) => renderToStaticMarkup(node);

interface Grid {
  cells: Record<string, string[]>; // "fire/cardinal" -> point ids
  elementTotals: Record<string, number>;
  modalityTotals: Record<string, number>;
  grandTotal: number;
}

/** Reads the rendered grid back from its markup. */
function readGrid(html: string): Grid {
  const cells: Grid["cells"] = {};
  for (const m of html.matchAll(/<td\b[^>]*data-element="(\w+)" data-modality="(\w+)"[^>]*>([\s\S]*?)<\/td>/g)) {
    cells[`${m[1]}/${m[2]}`] = [...m[3].matchAll(/data-point="(\w+)"/g)].map((p) => p[1]);
  }
  const elementTotals = Object.fromEntries(
    [...html.matchAll(/data-element-total="(\w+)"[^>]*>(\d+)</g)].map((m) => [m[1], Number(m[2])]),
  );
  const modalityTotals = Object.fromEntries(
    [...html.matchAll(/data-modality-total="(\w+)"[^>]*>(\d+)</g)].map((m) => [m[1], Number(m[2])]),
  );
  return { cells, elementTotals, modalityTotals, grandTotal: Number(html.match(/data-grand-total="(\d+)"/)![1]) };
}

describe("element by modality grid (REQ-004)", () => {
  it("chart B reproduces the totals and the membership of the Astro-Seek screenshot SRC-003", () => {
    const grid = readGrid(render(<ElementModalityGrid chart={charts.B} />));
    expect(grid.elementTotals).toEqual({ fire: 7, earth: 2, air: 5, water: 3 });
    expect(grid.modalityTotals).toEqual({ cardinal: 6, fixed: 6, mutable: 5 });
    expect(grid.grandTotal).toBe(17);

    // The grid of the screenshot, cell by cell (glyphs mapped to point ids).
    expect(grid.cells).toEqual({
      "fire/cardinal": ["Fortune"],
      "fire/fixed": ["Venus", "NorthNode"],
      "fire/mutable": ["Mars", "Pluto", "Lilith", "Chiron"],
      "earth/cardinal": [],
      "earth/fixed": ["Jupiter", "Saturn"],
      "earth/mutable": [],
      "air/cardinal": ["Sun", "Mercury", "ASC"],
      "air/fixed": ["Uranus", "Neptune"],
      "air/mutable": [],
      "water/cardinal": ["Vertex", "MC"],
      "water/fixed": [],
      "water/mutable": ["Moon"],
    });
  });

  it("chart A counts 17 points: the screenshot SRC-002 grid of 15 plus Fortune and Vertex", () => {
    const grid = readGrid(render(<ElementModalityGrid chart={charts.A} />));
    expect(grid.elementTotals).toEqual({ fire: 5, earth: 2, air: 6, water: 4 });
    expect(grid.modalityTotals).toEqual({ cardinal: 7, fixed: 6, mutable: 4 });
    expect(grid.grandTotal).toBe(17);

    // SRC-002 prints Fire 4, Earth 2, Air 6, Water 3 and Cardinal 6, Fixed 5, Mutable 4 for its 15 points.
    // Fortune (Leo: fire, fixed) and Vertex (Cancer: water, cardinal) are the two extra points.
    expect(grid.cells["fire/fixed"]).toContain("Fortune");
    expect(grid.cells["water/cardinal"]).toContain("Vertex");
    expect(grid.elementTotals.fire - 1).toBe(4);
    expect(grid.elementTotals.water - 1).toBe(3);
    expect(grid.modalityTotals.cardinal - 1).toBe(6);
    expect(grid.modalityTotals.fixed - 1).toBe(5);
    expect(grid.modalityTotals.mutable).toBe(4);
  });

  it("every point is counted exactly once and the South Node is never counted", () => {
    for (const name of ["A", "B", "C", "D", "unknownTime"] as const) {
      const grid = readGrid(render(<ElementModalityGrid chart={charts[name]} />));
      const members = Object.values(grid.cells).flat();
      expect(new Set(members).size, name).toBe(members.length);
      expect(members, name).not.toContain("SouthNode");
      expect(members.length, name).toBe(grid.grandTotal);
      expect(Object.values(grid.elementTotals).reduce((a, b) => a + b, 0), name).toBe(grid.grandTotal);
      expect(Object.values(grid.modalityTotals).reduce((a, b) => a + b, 0), name).toBe(grid.grandTotal);
      expect(members.length, name).toBe(getAnalysisPoints(charts[name]).length);
    }
  });

  it("builds the groups from the same sign values the position table prints", () => {
    const chart = charts.C;
    const table = positionRows(render(<PlanetsTable chart={chart} />));
    const groups = groupByElementModality(getAnalysisPoints(chart));
    const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
    const elementOf = (sign: string) => ELEMENTS[SIGNS.indexOf(sign) % 4] as Element;
    const modalityOf = (sign: string) => MODALITIES[SIGNS.indexOf(sign) % 3] as Modality;
    for (const element of ELEMENTS) {
      for (const modality of MODALITIES) {
        const expected = Object.entries(table)
          .filter(([id]) => id !== "SouthNode")
          .filter(([, cells]) => {
            const sign = cells[1].replace(/^[♈-♓]\s*/, "");
            return elementOf(sign) === element && modalityOf(sign) === modality;
          })
          .map(([id]) => id);
        expect(groups.cells[element][modality].map((p) => p.id), `${element}/${modality}`).toEqual(expected);
      }
    }
  });

  it("states the inclusion rule in one sentence with the number of points counted", () => {
    expect(textOf(render(<ElementModalityGrid chart={charts.B} />))).toContain(
      "Counts the 17 points of the positions table (the ten bodies, North Node, Lilith and Chiron, plus Part of Fortune, Vertex, the Ascendant and Midheaven when the birth time is known) without the South Node, which mirrors the North Node.",
    );
  });

  it("excludes ASC, MC, Fortune and Vertex for an unknown birth time and counts the rest", () => {
    const grid = readGrid(render(<ElementModalityGrid chart={charts.unknownTime} />));
    expect(grid.grandTotal).toBe(13);
    const members = Object.values(grid.cells).flat();
    for (const id of ["ASC", "MC", "Fortune", "Vertex", "SouthNode"]) expect(members).not.toContain(id);
    expect(grid.elementTotals).toEqual({ fire: 1, earth: 4, air: 3, water: 5 });
    expect(grid.modalityTotals).toEqual({ cardinal: 6, fixed: 4, mutable: 3 });
  });

  it("renders in Russian without leaking translation keys", async () => {
    await initI18n("ru");
    const html = render(<ElementModalityGrid chart={charts.B} />);
    await initI18n("en");
    const text = textOf(html);
    expect(text).toContain("Стихии и качества");
    expect(text).toContain("Кардинальные");
    expect(text).toContain("Огонь");
    expect(text).toContain("Итого");
    expect(html).not.toMatch(RAW_KEY);
  });
});

describe("0 to 30 degree strip (REQ-004)", () => {
  /** [x in percent, lane] per point id. */
  function readStrip(html: string) {
    return Object.fromEntries(
      tagsWith(html, "li", "data-point").map((t) => [t["data-point"], { x: Number(t["data-x"]), lane: Number(t["data-lane"]), label: t["aria-label"] }]),
    );
  }

  it("places every analysis point at its degree within its sign", () => {
    const strip = readStrip(render(<DegreeStrip chart={charts.A} />));
    expect(Object.keys(strip).sort()).toEqual(getAnalysisPoints(charts.A).map((p) => p.id).sort());
    expect(strip).not.toHaveProperty("SouthNode");
    // Sun 9°10′ -> 9.1667 of 30 degrees; Mercury 0°50′; MC 20°37′; ASC 24°58′ (SRC-002 strip: 9, 0, 20, 24).
    expect(strip.Sun.x).toBeCloseTo((9 + 10 / 60) / 30 * 100, 2);
    expect(strip.Mercury.x).toBeCloseTo((0 + 50 / 60) / 30 * 100, 2);
    expect(strip.MC.x).toBeCloseTo((20 + 37 / 60) / 30 * 100, 2);
    expect(strip.ASC.x).toBeCloseTo((24 + 58 / 60) / 30 * 100, 2);
    expect(strip.Sun.label).toBe("Sun, Aries 9°10′");
    expect(strip.ASC.label).toBe("Ascendant, Aquarius 24°58′");
  });

  it("reconciles with the position table: same degree and minute for every point", () => {
    for (const name of ["A", "B", "C", "D"] as const) {
      const table = positionRows(render(<PlanetsTable chart={charts[name]} />));
      const strip = readStrip(render(<DegreeStrip chart={charts[name]} />));
      for (const [id, marker] of Object.entries(strip)) {
        const [, d, m] = table[id][2].match(/^(\d+)°(\d\d)′$/)!;
        expect(marker.x, `${name} ${id}`).toBeCloseTo((Number(d) + Number(m) / 60) / 30 * 100, 2);
      }
    }
  });

  it("shows the same points as the element grid, so both summaries share one inclusion rule", () => {
    for (const name of ["A", "B", "unknownTime"] as const) {
      const strip = Object.keys(readStrip(render(<DegreeStrip chart={charts[name]} />))).sort();
      const grid = Object.values(readGrid(render(<ElementModalityGrid chart={charts[name]} />)).cells).flat().sort();
      expect(strip, name).toEqual(grid);
    }
  });

  it("omits ASC and MC for an unknown birth time", () => {
    const strip = readStrip(render(<DegreeStrip chart={charts.unknownTime} />));
    expect(Object.keys(strip)).toHaveLength(13);
    expect(strip).not.toHaveProperty("ASC");
    expect(strip).not.toHaveProperty("MC");
  });

  it("spreads points that are closer than their labels over rows without hiding any", () => {
    const gap = 9;
    const markers = layoutDegreeStrip(getAnalysisPoints(charts.A), gap);
    expect(markers).toHaveLength(17);
    for (const lane of new Set(markers.map((m) => m.lane))) {
      const xs = markers.filter((m) => m.lane === lane).map((m) => m.x).sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1], `lane ${lane}`).toBeGreaterThanOrEqual(gap);
    }
    // the cluster at about 27 degrees (Moon, Venus, Uranus) needs three rows
    const cluster = markers.filter((m) => ["Moon", "Venus", "Uranus"].includes(m.point.id));
    expect(new Set(cluster.map((m) => m.lane)).size).toBe(3);
  });

  it("puts a lone point on the first row", () => {
    const [only] = layoutDegreeStrip(getAnalysisPoints(charts.A).slice(0, 1), 9);
    expect(only.lane).toBe(0);
  });

  it("draws the 0 to 30 degree scale", () => {
    const text = textOf(render(<DegreeStrip chart={charts.B} />));
    for (const mark of ["0°", "5°", "10°", "15°", "20°", "25°", "30°"]) expect(text).toContain(mark);
  });

  it("renders in Russian without leaking translation keys", async () => {
    await initI18n("ru");
    const html = render(<DegreeStrip chart={charts.A} />);
    await initI18n("en");
    expect(html).toContain("Градус внутри знака");
    expect(html).toContain("Солнце, Овен 9°10′");
    expect(html).not.toMatch(RAW_KEY);
  });
});
