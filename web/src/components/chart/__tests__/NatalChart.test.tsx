import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import NatalChart from "@/components/chart/NatalChart";
import AspectLines from "@/components/chart/AspectLines";
import AspectFilters from "@/components/chart/AspectFilters";
import { ChartTooltipContent } from "@/components/chart/ChartTooltip";
import {
  ANGLE_LABELS,
  ASPECT_COLORS,
  CHART_LAYOUT,
  EXTRA_POINT_GLYPHS,
  MAJOR_ASPECT_TYPES,
  MINOR_ASPECT_TYPES,
  PLANET_GLYPHS,
  ZODIAC_GLYPHS,
  ZODIAC_SIGNS,
  ALL_ASPECT_TYPES,
  DEFAULT_ASPECT_TYPES,
  filterAspects,
  getAngles,
  getPositions,
  getSharedAspects,
  splitLongitude,
  wheelRotation,
  aspectSegments,
  signGlyph,
  formatSignedOrb,
} from "@astroweb/chart-core";
import { loadFixtures, type FixtureName } from "@astroweb/chart-core/test-fixtures";

const { charts } = loadFixtures();
const { cx, cy } = CHART_LAYOUT;

const WEB = join(__dirname, "..", "..", "..", "..");
function readLocale(lang: "en" | "ru"): Record<string, unknown> {
  return JSON.parse(readFileSync(join(WEB, "public", "locales", lang, "translation.json"), "utf-8")) as Record<string, unknown>;
}
const en = readLocale("en");
const ru = readLocale("ru");
/** Texts the tooltip shares with the tables: point names, retrograde, applying and separating. */
const natalChart = en.natalChart as { points: Record<string, string>; positions: { retrograde: string }; aspects: { applying: string; separating: string } };

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    resources: { en: { translation: en }, ru: { translation: ru } },
  });
});

function render(name: FixtureName): string {
  return renderToStaticMarkup(<NatalChart chart={charts[name]} />);
}

type Attrs = Record<string, string>;

/** Attributes of every `<tag ...>` that has the attribute `attr`. */
function tagsWith(html: string, tag: string, attr: string): Attrs[] {
  const found: Attrs[] = [];
  for (const m of html.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, "g"))) {
    const attrs: Attrs = {};
    for (const a of m[1].matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    if (attr in attrs) found.push(attrs);
  }
  return found;
}

/** The markup inside `<g ... attr="value" ...> ... </g>` (the groups under test hold no nested group). */
function groupOf(html: string, attr: string, value: string): string {
  const match = new RegExp(`<g[^>]*${attr}="${value}"[^>]*>([\\s\\S]*?)</g>`).exec(html);
  if (!match) throw new Error(`no <g ${attr}="${value}">`);
  return match[1];
}

/** Text content of the element carrying `data-field="field"` inside `markup`. */
function field(markup: string, name: string): string {
  const match = new RegExp(`data-field="${name}"[^>]*>([^<]*)<`).exec(markup);
  if (!match) throw new Error(`no data-field="${name}"`);
  return match[1];
}

const KNOWN_TIME: FixtureName[] = ["A", "B", "C", "D"];

describe("NatalChart: frame and accessibility", () => {
  it("keeps role=img and a translated aria-label on the svg", () => {
    const html = render("A");
    expect(html).toContain('role="img"');
    expect(html).toContain(`aria-label="${(en.natalWheel as { ariaLabel: string }).ariaLabel}"`);
  });

  it("renders without leaking translation keys or broken numbers", () => {
    for (const name of Object.keys(charts) as FixtureName[]) {
      const html = render(name);
      expect(html, name).not.toContain("natalWheel.");
      expect(html, name).not.toContain("NaN");
      expect(html, name).not.toContain("undefined");
    }
  });

  it("is labelled in Russian when the language is Russian", async () => {
    await i18next.changeLanguage("ru");
    try {
      const html = render("A");
      expect(html).toContain((ru.natalWheel as { ariaLabel: string }).ariaLabel);
      expect(html).not.toContain("natalWheel.");
    } finally {
      await i18next.changeLanguage("en");
    }
  });
});

describe("NatalChart: zodiac ring and degree scale", () => {
  it("draws the twelve sign glyphs in zodiac order", () => {
    for (const name of Object.keys(charts) as FixtureName[]) {
      const signs = tagsWith(render(name), "text", "data-sign");
      expect(signs.map((s) => s["data-sign"]), name).toEqual(ZODIAC_SIGNS);
    }
    const html = render("A");
    for (const sign of ZODIAC_SIGNS) expect(html).toContain(`>${signGlyph(sign)}<`);
  });

  it("draws a graduated degree scale: a tick every degree, longer every 5 and 10", () => {
    for (const name of Object.keys(charts) as FixtureName[]) {
      const paths = tagsWith(render(name), "path", "data-scale");
      const ticks = Object.fromEntries(paths.map((p) => [p["data-scale"], (p.d.match(/M/g) ?? []).length]));
      expect(ticks, name).toEqual({ degree: 288, five: 36, ten: 36 });
    }
  });
});

describe("NatalChart: orientation and houses (known birth time)", () => {
  it("draws twelve numbered houses between the calculated cusps", () => {
    for (const name of KNOWN_TIME) {
      const html = render(name);
      expect(tagsWith(html, "line", "data-house-cusp").map((l) => l["data-house-cusp"]), name).toEqual(
        Array.from({ length: 12 }, (_, i) => String(i + 1)),
      );
      expect(tagsWith(html, "text", "data-house-number").map((t) => t["data-house-number"]), name).toEqual(
        Array.from({ length: 12 }, (_, i) => String(i + 1)),
      );
    }
  });

  it("puts the house 1 cusp on the left (9 o'clock) axis in every house system", () => {
    for (const name of [...KNOWN_TIME, "fallback"] as FixtureName[]) {
      const cusp1 = tagsWith(render(name), "line", "data-house-cusp").find((l) => l["data-house-cusp"] === "1")!;
      expect(Number(cusp1.y1), name).toBeCloseTo(cy, 3);
      expect(Number(cusp1.y2), name).toBeCloseTo(cy, 3);
      expect(Number(cusp1.x1), name).toBeLessThan(cx);
      expect(Number(cusp1.x2), name).toBeLessThan(cx);
    }
  });

  it("draws the cusps where the system calculated them: not 30 degrees apart in Koch and Placidus", () => {
    for (const name of ["C", "D"] as const) {
      const lines = tagsWith(render(name), "line", "data-house-cusp");
      const angleOf = (l: Attrs) => Math.atan2(cy - Number(l.y2), Number(l.x2) - cx) * (180 / Math.PI);
      const gaps = lines.map((l, i) => ((angleOf(lines[(i + 1) % 12]) - angleOf(l) + 720) % 360));
      expect(Math.max(...gaps) - Math.min(...gaps), name).toBeGreaterThan(5);
    }
  });

  it("draws Whole Sign houses 30 degrees apart, starting at the sign of the ASC", () => {
    const lines = tagsWith(render("A"), "line", "data-house-cusp");
    const angleOf = (l: Attrs) => Math.atan2(cy - Number(l.y2), Number(l.x2) - cx) * (180 / Math.PI);
    lines.forEach((l, i) => {
      const next = lines[(i + 1) % 12];
      expect(((angleOf(next) - angleOf(l) + 720) % 360)).toBeCloseTo(30, 6);
    });
    // The first sign on the left axis, below it, is Aquarius, the ASC's sign (SRC-002)
    const aquarius = tagsWith(render("A"), "text", "data-sign").find((s) => s["data-sign"] === "Aquarius")!;
    expect(Number(aquarius.x)).toBeLessThan(cx);
    expect(Number(aquarius.y)).toBeGreaterThan(cy);
  });
});

describe("NatalChart: ASC, DSC, MC and IC", () => {
  it("draws four labelled axes with sign glyph, degree and minute at their calculated longitudes", () => {
    for (const name of [...KNOWN_TIME, "fallback"] as FixtureName[]) {
      const html = render(name);
      const axes = tagsWith(html, "g", "data-angle");
      expect(axes.map((a) => a["data-angle"]), name).toEqual(["ASC", "DSC", "MC", "IC"]);
      const angles = getAngles(charts[name])!;
      const lons = { ASC: angles.asc, DSC: angles.dsc, MC: angles.mc, IC: angles.ic };
      for (const id of ["ASC", "DSC", "MC", "IC"] as const) {
        const markup = groupOf(html, "data-angle", id);
        const { sign, degree, minute } = splitLongitude(lons[id]);
        expect(field(markup, "name"), `${name} ${id}`).toBe(ANGLE_LABELS[id]);
        expect(field(markup, "degree"), `${name} ${id}`).toBe(`${degree}°`);
        expect(field(markup, "sign"), `${name} ${id}`).toBe(signGlyph(sign));
        expect(field(markup, "minute"), `${name} ${id}`).toBe(`${String(minute).padStart(2, "0")}′`);
      }
    }
  });

  it("shows the ASC and MC of the reference charts (SRC-002, SRC-003)", () => {
    const a = render("A");
    expect([field(groupOf(a, "data-angle", "ASC"), "degree"), field(groupOf(a, "data-angle", "ASC"), "minute")]).toEqual(["24°", "58′"]);
    expect(field(groupOf(a, "data-angle", "ASC"), "sign")).toBe(signGlyph("Aquarius"));
    expect([field(groupOf(a, "data-angle", "MC"), "degree"), field(groupOf(a, "data-angle", "MC"), "minute")]).toEqual(["20°", "37′"]);
    expect(field(groupOf(a, "data-angle", "MC"), "sign")).toBe(signGlyph("Scorpio"));
    const b = render("B");
    expect([field(groupOf(b, "data-angle", "ASC"), "degree"), field(groupOf(b, "data-angle", "ASC"), "minute")]).toEqual(["23°", "43′"]);
    expect(field(groupOf(b, "data-angle", "MC"), "sign")).toBe(signGlyph("Cancer"));
  });

  it("draws the angles independently of the house cusps: in Whole Sign the ASC is not on the left axis", () => {
    const a = groupOf(render("A"), "data-angle", "ASC");
    const first = /<line[^>]*x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/.exec(a)!;
    // Inner end of the ASC axis, on the inner circle: clearly below the 9 o'clock axis (y > cy).
    expect(Number(first[2])).toBeGreaterThan(cy + 20);
    expect(Number(first[1])).toBeLessThan(cx);
  });

  it("draws the ASC on the left axis when the house system puts it there (Koch)", () => {
    const c = groupOf(render("C"), "data-angle", "ASC");
    const first = /<line[^>]*y1="([\d.]+)"[^>]*y2="([\d.]+)"/.exec(c)!;
    expect(Number(first[1])).toBeCloseTo(cy, 3);
    expect(Number(first[2])).toBeCloseTo(cy, 3);
  });

  it("puts the MC near the top for a chart whose MC is above the horizon centre line", () => {
    for (const name of ["A", "B", "C", "D"] as const) {
      const mc = groupOf(render(name), "data-angle", "MC");
      const first = /<line[^>]*y1="([\d.]+)" x2="[\d.]+" y2="([\d.]+)"/.exec(mc)!;
      // The MC axis runs from the inner circle to the sign band; its outer end is in the upper half
      expect(Number(first[2]), name).toBeLessThan(cy);
    }
  });
});

describe("NatalChart: house cusp labels", () => {
  const cuspLabelMarkup = (html: string, house: number) => groupOf(html, "data-cusp-label", String(house));
  const labelledHouses = (html: string) => tagsWith(html, "g", "data-cusp-label").map((g) => Number(g["data-cusp-label"]));
  const valueOf = (markup: string) => ({
    degree: field(markup, "degree"),
    sign: field(markup, "sign"),
    minute: field(markup, "minute"),
  });

  /** Centre of a rendered label block: the x of its text and the middle between its two lines. */
  function labelCentre(markup: string): { x: number; y: number } {
    const texts = [...markup.matchAll(/<text\b[^>]*\bx="([\d.]+)" y="([\d.]+)"/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
    return { x: texts[0].x, y: (texts[0].y + texts[texts.length - 1].y) / 2 };
  }

  it("draws a label at all twelve cusps of a Whole Sign chart, 0 degrees 00 minutes of the sign", () => {
    for (const name of ["A", "B"] as const) {
      const html = render(name);
      expect(labelledHouses(html), name).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      charts[name].houses.cusps.forEach((cusp, i) => {
        const { sign } = splitLongitude(cusp);
        expect(valueOf(cuspLabelMarkup(html, i + 1)), `${name} house ${i + 1}`).toEqual({
          degree: "0\u00B0",
          sign: signGlyph(sign),
          minute: "00\u2032",
        });
      });
    }
  });

  it("starts at the sign of the ASC: house 1 is 0 degrees Aquarius in A (SRC-002) and 0 degrees Libra in B (SRC-003)", () => {
    expect(valueOf(cuspLabelMarkup(render("A"), 1)).sign).toBe(signGlyph("Aquarius"));
    expect(valueOf(cuspLabelMarkup(render("B"), 1)).sign).toBe(signGlyph("Libra"));
    expect(valueOf(cuspLabelMarkup(render("B"), 7)).sign).toBe(signGlyph("Aries"));
  });

  it("draws eight in Koch and Placidus and leaves out the cusps that are the ASC, IC, DSC and MC", () => {
    for (const name of ["C", "D"] as const) {
      const html = render(name);
      expect(labelledHouses(html), name).toEqual([2, 3, 5, 6, 8, 9, 11, 12]);
      for (const house of labelledHouses(html)) {
        const { sign, degree, minute } = splitLongitude(charts[name].houses.cusps[house - 1]);
        expect(valueOf(cuspLabelMarkup(html, house)), `${name} house ${house}`).toEqual({
          degree: `${degree}\u00B0`,
          sign: signGlyph(sign),
          minute: `${String(minute).padStart(2, "0")}\u2032`,
        });
      }
      // The angle label carries the value of the cusp that was left out
      const angles = getAngles(charts[name])!;
      expect(charts[name].houses.cusps[0]).toBeCloseTo(angles.asc, 6);
      expect(charts[name].houses.cusps[9]).toBeCloseTo(angles.mc, 6);
    }
  });

  it("draws none, and no cusp mark, when the birth time is unknown", () => {
    const html = render("unknownTime");
    expect(labelledHouses(html)).toEqual([]);
    expect(html).not.toContain("data-cusp-label");
    expect(html).not.toContain("data-cusp-extension");
  });

  it("puts each label on its cusp line outside the sign band, inside the view box", () => {
    for (const name of KNOWN_TIME) {
      const html = render(name);
      const rotation = wheelRotation(charts[name]);
      for (const group of tagsWith(html, "g", "data-cusp-label")) {
        const house = Number(group["data-cusp-label"]);
        const centre = labelCentre(cuspLabelMarkup(html, house));
        expect(Math.hypot(centre.x - cx, centre.y - cy), `${name} ${house}`).toBeGreaterThan(CHART_LAYOUT.outerRadius);
        expect(centre.x, `${name} ${house}`).toBeGreaterThan(20);
        expect(centre.x, `${name} ${house}`).toBeLessThan(CHART_LAYOUT.size - 20);
        expect(centre.y, `${name} ${house}`).toBeGreaterThan(20);
        expect(centre.y, `${name} ${house}`).toBeLessThan(CHART_LAYOUT.size - 20);
        if (group["data-displaced"] === "false") {
          const drawn = ((Math.atan2(cy - centre.y, centre.x - cx) * 180) / Math.PI + 360) % 360;
          const expected = (((180 + (charts[name].houses.cusps[house - 1] - rotation)) % 360) + 360) % 360;
          expect(Math.abs(((drawn - expected + 540) % 360) - 180), `${name} ${house}`).toBeLessThan(0.01);
        }
      }
    }
  });

  it("carries the cusp line across the sign band, and joins a moved label to its cusp with a leader", () => {
    const html = render("A");
    expect(tagsWith(html, "line", "data-cusp-extension")).toHaveLength(12);
    const moved = tagsWith(html, "g", "data-cusp-label").filter((g) => g["data-displaced"] === "true");
    expect(moved.length).toBeGreaterThan(0);
    for (const group of moved) expect(cuspLabelMarkup(html, Number(group["data-cusp-label"]))).toContain("data-leader");
    const unmoved = tagsWith(html, "g", "data-cusp-label").filter((g) => g["data-displaced"] === "false");
    for (const group of unmoved) expect(cuspLabelMarkup(html, Number(group["data-cusp-label"]))).not.toContain("data-leader");
  });

  it("keeps the cusp labels clear of the angle labels", () => {
    for (const name of KNOWN_TIME) {
      const html = render(name);
      const angleCentres = (["ASC", "DSC", "MC", "IC"] as const).map((id) => {
        const markup = groupOf(html, "data-angle", id);
        const y = Number(/data-field="minute"[^>]*\by="([\d.]+)"/.exec(markup)![1]) - 17;
        const x = Number(/data-field="minute"[^>]*\bx="([\d.]+)"/.exec(markup)![1]);
        return { x, y };
      });
      for (const house of labelledHouses(html)) {
        const centre = labelCentre(cuspLabelMarkup(html, house));
        for (const angle of angleCentres) {
          expect(Math.hypot(centre.x - angle.x, centre.y - angle.y), `${name} house ${house}`).toBeGreaterThan(40);
        }
      }
    }
  });

  it("is smaller and dimmer than the angle labels", () => {
    const html = render("A");
    const size = (markup: string) => Number(/<text[^>]*font-size="(\d+)"/.exec(markup)![1]);
    expect(size(cuspLabelMarkup(html, 3))).toBeLessThan(size(groupOf(html, "data-angle", "ASC")));
    expect(cuspLabelMarkup(html, 3)).toContain("rgba(255,255,255,0.65)");
    expect(groupOf(html, "data-angle", "ASC")).toContain("rgba(255,255,255,0.9)");
  });
});

describe("NatalChart: plotted points", () => {
  it("draws every calculated point with its glyph, degree, sign glyph and minute", () => {
    for (const name of Object.keys(charts) as FixtureName[]) {
      const html = render(name);
      const positions = getPositions(charts[name]);
      const groups = tagsWith(html, "g", "data-point");
      expect(groups.map((g) => g["data-point"]), name).toEqual(positions.map((p) => p.id));
      for (const p of positions) {
        const markup = groupOf(html, "data-point", p.id);
        const { sign, degree, minute } = splitLongitude(p.lon);
        const glyph = PLANET_GLYPHS[p.id] ?? EXTRA_POINT_GLYPHS[p.id];
        expect(field(markup, "glyph"), `${name} ${p.id}`).toBe(glyph);
        expect(field(markup, "degree"), `${name} ${p.id}`).toBe(`${degree}°`);
        expect(field(markup, "sign"), `${name} ${p.id}`).toBe(signGlyph(sign));
        expect(field(markup, "minute"), `${name} ${p.id}`).toBe(`${String(minute).padStart(2, "0")}′`);
      }
    }
  });

  it("includes both lunar nodes, Lilith, Chiron, Fortune and Vertex with a known birth time", () => {
    const ids = tagsWith(render("B"), "g", "data-point").map((g) => g["data-point"]);
    for (const id of ["NorthNode", "SouthNode", "Lilith", "Chiron", "Fortune", "Vertex"]) expect(ids).toContain(id);
    expect(EXTRA_POINT_GLYPHS.Fortune).toBe("⊗");
  });

  it("omits Fortune and Vertex without a birth time", () => {
    const ids = tagsWith(render("unknownTime"), "g", "data-point").map((g) => g["data-point"]);
    expect(ids).not.toContain("Fortune");
    expect(ids).not.toContain("Vertex");
    expect(ids).toContain("NorthNode");
  });

  it("marks retrograde points with an R and no other point", () => {
    for (const name of Object.keys(charts) as FixtureName[]) {
      const html = render(name);
      const expected = getPositions(charts[name])
        .filter((p) => p.retrograde === true)
        .map((p) => p.id);
      const markers = tagsWith(html, "text", "data-retrograde-marker").map((t) => t["data-retrograde-marker"]);
      expect(markers, name).toEqual(expected);
      for (const id of markers) expect(groupOf(html, "data-point", id)).toMatch(/data-retrograde-marker="[^"]+"[^>]*>R</);
    }
    // SRC-002 (dataset A): Pluto and the nodes; SRC-003 (dataset B): Jupiter, Saturn, Uranus, Neptune and the node
    expect(tagsWith(render("A"), "text", "data-retrograde-marker").map((t) => t["data-retrograde-marker"])).toEqual([
      "Pluto",
      "NorthNode",
      "SouthNode",
    ]);
  });

  it("ties every label to its exact longitude with a tick on the ring and a leader", () => {
    for (const name of KNOWN_TIME) {
      const html = render(name);
      for (const p of getPositions(charts[name])) {
        const markup = groupOf(html, "data-point", p.id);
        expect(markup, `${name} ${p.id}`).toContain('data-tick="ring"');
        expect(markup, `${name} ${p.id}`).toContain('data-tick="inner"');
        expect(markup, `${name} ${p.id}`).toContain("data-leader");
      }
    }
  });

  it("places the ring tick of each point at its exact longitude", () => {
    const chart = charts.A;
    const rotation = wheelRotation(chart);
    const html = render("A");
    for (const p of getPositions(chart)) {
      const tick = /<line[^>]*data-tick="ring"[^>]*>/.exec(groupOf(html, "data-point", p.id))![0];
      const x = Number(/x1="([\d.]+)"/.exec(tick)![1]);
      const y = Number(/y1="([\d.]+)"/.exec(tick)![1]);
      const svgAngle = 180 + (p.lon - rotation);
      expect(x).toBeCloseTo(cx + CHART_LAYOUT.zodiacInner * Math.cos((svgAngle * Math.PI) / 180), 3);
      expect(y).toBeCloseTo(cy - CHART_LAYOUT.zodiacInner * Math.sin((svgAngle * Math.PI) / 180), 3);
    }
  });
});

describe("NatalChart: aspect lines", () => {
  it("draws the five major aspects of the shared set by default, with no minor aspect", () => {
    for (const name of KNOWN_TIME) {
      const html = render(name);
      const shared = getSharedAspects(charts[name]);
      const lines = tagsWith(html, "line", "data-aspect-type");
      expect(lines.length, name).toBe(filterAspects(shared, new Set(DEFAULT_ASPECT_TYPES)).length);
      expect(lines.every((l) => l["data-aspect-class"] === "major"), name).toBe(true);
      expect(lines.length).toBeGreaterThan(0);
    }
  });

  it("draws aspects to ASC and MC, and none of the South Node", () => {
    const lines = tagsWith(render("A"), "line", "data-aspect-type");
    expect(lines.some((l) => ["ASC", "MC"].includes(l["data-aspect-a"]) || ["ASC", "MC"].includes(l["data-aspect-b"]))).toBe(true);
    for (const name of Object.keys(charts) as FixtureName[]) {
      const all = tagsWith(render(name), "line", "data-aspect-type");
      expect(all.some((l) => l["data-aspect-a"] === "SouthNode" || l["data-aspect-b"] === "SouthNode"), name).toBe(false);
    }
  });

  it("draws no aspect to an angle without a birth time", () => {
    const lines = tagsWith(render("unknownTime"), "line", "data-aspect-type");
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => ["ASC", "DSC", "MC", "IC"].includes(l["data-aspect-a"]) || ["ASC", "DSC", "MC", "IC"].includes(l["data-aspect-b"]))).toBe(false);
  });

  it("draws minor aspects dashed and in their own colour once they are shown, majors solid", () => {
    const chart = charts.D;
    const rotation = wheelRotation(chart);
    const segments = aspectSegments(chart, filterAspects(getSharedAspects(chart), new Set(ALL_ASPECT_TYPES)), rotation);
    const html = renderToStaticMarkup(<AspectLines segments={segments} focusId={null} showSymbols revealed />);
    const lines = tagsWith(html, "line", "data-aspect-type");
    expect(lines).toHaveLength(segments.length);
    const minors = lines.filter((l) => l["data-aspect-class"] === "minor");
    const majors = lines.filter((l) => l["data-aspect-class"] === "major");
    expect(minors.length).toBeGreaterThan(0);
    expect(majors.length).toBeGreaterThan(0);
    for (const l of minors) expect(l["stroke-dasharray"]).toBe("6 5");
    for (const l of majors) expect(l["stroke-dasharray"]).toBeUndefined();
    for (const l of lines) expect(l.stroke).toBe(ASPECT_COLORS[l["data-aspect-type"]]);
    // Every one of the eleven types has its own colour
    expect(new Set(Object.values(ASPECT_COLORS)).size).toBe(ALL_ASPECT_TYPES.length);
  });

  it("makes the tighter orb the heavier line", () => {
    const chart = charts.A;
    const segments = aspectSegments(chart, getSharedAspects(chart), wheelRotation(chart));
    const html = renderToStaticMarkup(<AspectLines segments={segments} focusId={null} showSymbols={false} revealed />);
    const widths = new Map(tagsWith(html, "line", "data-aspect-type").map((l, i) => [segments[i].exactness, Number(l["stroke-width"])]));
    const byExactness = [...widths.entries()].sort((a, b) => a[0] - b[0]);
    expect(byExactness[byExactness.length - 1][1]).toBeGreaterThan(byExactness[0][1]);
  });

  it("draws the aspect glyph on the lines, and none when the option is off", () => {
    const chart = charts.A;
    const segments = aspectSegments(chart, filterAspects(getSharedAspects(chart), new Set(ALL_ASPECT_TYPES)), wheelRotation(chart));
    const on = renderToStaticMarkup(<AspectLines segments={segments} focusId={null} showSymbols revealed />);
    const off = renderToStaticMarkup(<AspectLines segments={segments} focusId={null} showSymbols={false} revealed />);
    expect(tagsWith(on, "text", "data-aspect-symbol").length).toBeGreaterThan(10);
    expect(tagsWith(off, "text", "data-aspect-symbol")).toHaveLength(0);
  });

  it("dims every line that does not touch the focused point", () => {
    const chart = charts.A;
    const segments = aspectSegments(chart, getSharedAspects(chart), wheelRotation(chart));
    const html = renderToStaticMarkup(<AspectLines segments={segments} focusId="Sun" showSymbols={false} revealed />);
    const groups = [...html.matchAll(/<g class="transition-opacity duration-200" style="opacity:([\d.]+)">/g)].map((m) => Number(m[1]));
    expect(groups).toHaveLength(segments.length);
    segments.forEach((s, i) => expect(groups[i]).toBe(s.a === "Sun" || s.b === "Sun" ? 1 : 0.05));
  });
});

describe("NatalChart: unknown birth time", () => {
  it("draws no houses, no house numbers and no angles", () => {
    const html = render("unknownTime");
    expect(tagsWith(html, "line", "data-house-cusp")).toHaveLength(0);
    expect(tagsWith(html, "text", "data-house-number")).toHaveLength(0);
    expect(tagsWith(html, "g", "data-angle")).toHaveLength(0);
    expect(html).not.toContain("data-house-cusp");
    expect(html).not.toContain("data-angle=");
  });

  it("still draws the zodiac ring, degree scale, points and aspect lines", () => {
    const html = render("unknownTime");
    expect(tagsWith(html, "text", "data-sign")).toHaveLength(12);
    expect(tagsWith(html, "path", "data-scale")).toHaveLength(3);
    expect(tagsWith(html, "g", "data-point").length).toBe(getPositions(charts.unknownTime).length);
    expect(tagsWith(html, "line", "data-aspect-type").length).toBeGreaterThan(0);
  });

  it("starts the zodiac at 0 degrees Aries on the left axis", () => {
    const aries = tagsWith(render("unknownTime"), "text", "data-sign").find((s) => s["data-sign"] === "Aries")!;
    // The Aries glyph is in the middle of the sign: 15 degrees below the left axis
    expect(Number(aries.x)).toBeLessThan(cx);
    expect(Number(aries.y)).toBeGreaterThan(cy);
    const tick = degreeTickAtLongitude(render("unknownTime"), 0);
    expect(tick.y).toBeCloseTo(cy, 3);
    expect(tick.x).toBeLessThan(cx);
  });

  it("says that the positions are local-noon estimates", () => {
    const html = render("unknownTime");
    expect(tagsWith(html, "p", "data-wheel-note")).toHaveLength(1);
    expect(html).toContain((en.natalWheel as { timeEstimatedNote: string }).timeEstimatedNote);
    expect(html).toContain("local noon");
  });

  it("shows no estimate note when the birth time is known", () => {
    for (const name of [...KNOWN_TIME, "fallback"] as FixtureName[]) expect(render(name), name).not.toContain("data-wheel-note");
  });
});

/** Start of the first scale path segment of the 10-degree ticks: the tick at longitude 0 comes first. */
function degreeTickAtLongitude(html: string, longitude: number): { x: number; y: number } {
  const path = tagsWith(html, "path", "data-scale").find((p) => p["data-scale"] === "ten")!;
  const starts = [...path.d.matchAll(/M([\d.]+) ([\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
  return starts[longitude / 10];
}

describe("AspectFilters", () => {
  const noop = () => {};

  it("offers a toggle for each of the eleven aspect types in a major and a minor group", () => {
    const html = renderToStaticMarkup(<AspectFilters activeFilters={new Set(DEFAULT_ASPECT_TYPES)} onToggle={noop} />);
    const buttons = tagsWith(html, "button", "data-aspect-filter").map((b) => b["data-aspect-filter"]);
    expect(buttons).toEqual([...MAJOR_ASPECT_TYPES, ...MINOR_ASPECT_TYPES]);
    const groups = tagsWith(html, "div", "data-filter-group").map((g) => g["data-filter-group"]);
    expect(groups).toEqual(["major", "minor"]);
    // Each type has its glyph and its own name, the same one the Aspects list shows
    for (const type of ALL_ASPECT_TYPES) {
      expect(html).toContain((en.chart as { aspects: Record<string, string> }).aspects[type]);
    }
  });

  it("marks the visible types as pressed: the five majors by default", () => {
    const html = renderToStaticMarkup(<AspectFilters activeFilters={new Set(DEFAULT_ASPECT_TYPES)} onToggle={noop} />);
    const pressed = tagsWith(html, "button", "data-aspect-filter")
      .filter((b) => b["aria-pressed"] === "true")
      .map((b) => b["data-aspect-filter"]);
    expect(pressed).toEqual([...MAJOR_ASPECT_TYPES]);
  });

  it("is backward compatible: no show-all or reset button without handlers", () => {
    const html = renderToStaticMarkup(<AspectFilters activeFilters={new Set(DEFAULT_ASPECT_TYPES)} onToggle={noop} />);
    expect(html).not.toContain((en.natalWheel as { filters: { showAll: string } }).filters.showAll);
    expect(html).not.toContain((en.natalWheel as { filters: { reset: string } }).filters.reset);
  });

  it("offers show all and reset when the handlers are given, each disabled when it would change nothing", () => {
    const filters = en.natalWheel as { filters: { showAll: string; reset: string } };
    const byDefault = renderToStaticMarkup(
      <AspectFilters activeFilters={new Set(DEFAULT_ASPECT_TYPES)} onToggle={noop} onShowAll={noop} onReset={noop} />,
    );
    expect(byDefault).toContain(filters.filters.showAll);
    expect(byDefault).toContain(filters.filters.reset);
    expect(byDefault).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>${filters.filters.reset}</button>`));
    expect(byDefault).not.toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>${filters.filters.showAll}</button>`));
    const shownAll = renderToStaticMarkup(
      <AspectFilters activeFilters={new Set(ALL_ASPECT_TYPES)} onToggle={noop} onShowAll={noop} onReset={noop} />,
    );
    expect(shownAll).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>${filters.filters.showAll}</button>`));
    expect(tagsWith(shownAll, "button", "data-aspect-filter").every((b) => b["aria-pressed"] === "true")).toBe(true);
  });

  it("is part of the wheel and starts from the default selection", () => {
    const html = render("A");
    const pressed = tagsWith(html, "button", "data-aspect-filter")
      .filter((b) => b["aria-pressed"] === "true")
      .map((b) => b["data-aspect-filter"]);
    expect(pressed).toEqual([...DEFAULT_ASPECT_TYPES]);
    expect(html).toContain((en.natalWheel as { filters: { showAll: string } }).filters.showAll);
  });
});

describe("ChartTooltipContent", () => {
  function target(name: FixtureName, id: string) {
    const chart = charts[name];
    const p = getPositions(chart).find((pos) => pos.id === id)!;
    return { id, lon: p.lon, house: p.house, retrograde: p.retrograde === true };
  }
  const textOf = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

  it("shows sign, degree, minute and house of a point", () => {
    const html = textOf(renderToStaticMarkup(<ChartTooltipContent target={target("A", "Sun")} aspects={[]} />));
    expect(html).toContain("Sun");
    expect(html).toContain("9°10′ Aries");
    expect(html).toContain("House 3");
    expect(html).not.toContain(natalChart.positions.retrograde);
  });

  it("says retrograde for a retrograde point", () => {
    const html = textOf(renderToStaticMarkup(<ChartTooltipContent target={target("A", "Pluto")} aspects={[]} />));
    expect(html).toContain("Retrograde");
    expect(html).toContain("17°36′ Sagittarius");
  });

  it("names the additional points and has no house without a birth time", () => {
    const html = textOf(renderToStaticMarkup(<ChartTooltipContent target={target("unknownTime", "NorthNode")} aspects={[]} />));
    expect(html).toContain("North Node");
    expect(html).not.toContain("House");
    const angle = textOf(
      renderToStaticMarkup(<ChartTooltipContent target={{ id: "MC", lon: getAngles(charts.A)!.mc, house: null, retrograde: false }} aspects={[]} />),
    );
    expect(angle).toContain("Midheaven");
    expect(angle).toContain("20°37′ Scorpio");
  });

  it("lists the shared aspects of the point with orb and applying or separating", () => {
    const shared = getSharedAspects(charts.A).filter((a) => a.a === "Sun" || a.b === "Sun");
    expect(shared.length).toBeGreaterThan(0);
    const html = textOf(renderToStaticMarkup(<ChartTooltipContent target={target("A", "Sun")} aspects={shared} />));
    for (const a of shared) {
      expect(html).toContain(formatSignedOrb(a));
      if (a.applying !== null) expect(html).toContain((a.applying ? natalChart.aspects.applying : natalChart.aspects.separating).toLowerCase());
    }
    // The orb is the value the Aspects list and the matrix show: signed degrees and minutes of the shared orb
    expect(html).toMatch(/\([−+]?\d+°\d{2}′(, (applying|separating))?\)/);
  });

  it("shows no applying or separating for a pair that has none", () => {
    const pair = getSharedAspects(charts.A).find((a) => a.applying === null)!;
    const html = textOf(renderToStaticMarkup(<ChartTooltipContent target={target("A", pair.a)} aspects={[pair]} />));
    expect(html).not.toContain(natalChart.aspects.applying.toLowerCase());
    expect(html).not.toContain(natalChart.aspects.separating.toLowerCase());
  });

  it("summarises a long aspect list", () => {
    const shared = getSharedAspects(charts.D).filter((a) => a.a === "Sun" || a.b === "Sun");
    const many = [...shared, ...shared, ...shared];
    const html = textOf(renderToStaticMarkup(<ChartTooltipContent target={target("D", "Sun")} aspects={many} />));
    expect(html).toContain(`+${many.length - 12} more`);
  });
});

describe("natalWheel texts", () => {
  type Tree = { [key: string]: string | Tree };
  /** Every text of the tree as [path, text]. */
  function leaves(tree: Tree, prefix = ""): Array<[string, string]> {
    return Object.entries(tree).flatMap(([key, value]): Array<[string, string]> =>
      typeof value === "string" ? [[`${prefix}${key}`, value]] : leaves(value, `${prefix}${key}.`),
    );
  }
  const enTree = en.natalWheel as Tree;
  const ruTree = ru.natalWheel as Tree;

  it("have the same keys in English and Russian and no empty text", () => {
    expect(leaves(ruTree).map(([key]) => key).sort()).toEqual(leaves(enTree).map(([key]) => key).sort());
    const empty = [...leaves(enTree), ...leaves(ruTree)].filter(([, text]) => text.trim() === "");
    expect(empty).toEqual([]);
  });

  it("find, in the shared texts, a name for every point, angle and aspect type the wheel can show", () => {
    for (const tree of [en, ru]) {
      const points = (tree.natalChart as { points: Tree }).points;
      for (const id of [...Object.keys(PLANET_GLYPHS), ...Object.keys(EXTRA_POINT_GLYPHS), ...Object.keys(ANGLE_LABELS)]) {
        expect(points[id], id).toBeTruthy();
      }
      const types = (tree.chart as { aspects: Tree }).aspects;
      for (const type of ALL_ASPECT_TYPES) expect(types[type], type).toBeTruthy();
      const shared = tree.natalChart as { positions: Tree; aspects: Tree };
      for (const text of [shared.positions.retrograde, shared.aspects.applying, shared.aspects.separating]) expect(text).toBeTruthy();
      expect((tree.tables as { planets: Tree }).planets.house).toBeTruthy();
    }
    expect(Object.keys(ZODIAC_GLYPHS)).toHaveLength(12);
  });
});
