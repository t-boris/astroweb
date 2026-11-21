import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ChartResult } from "@/types";
import { ChartContextLine } from "@/components/chart/ChartContextLine";
import { HouseSystemSelector } from "@/components/chart/HouseSystemSelector";
import { HouseAreasView } from "@/components/chart/HouseAreasView";
import {
  DEFAULT_HOUSE_SYSTEM,
  HOUSE_SYSTEMS,
  formatCoordinates,
  formatUtcTime,
  houseOfLongitude,
} from "@/components/chart/utils/viewModel";
import { RAW_KEY, charts, initI18n, tagsWith, textOf } from "./tablesTestSupport";

beforeAll(async () => {
  await initI18n("en");
});

const render = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("house system selector (REQ-001, DEC-009)", () => {
  it("offers Koch, Whole Sign and Placidus with Koch as the default", () => {
    expect(HOUSE_SYSTEMS).toEqual(["koch", "whole-sign", "placidus"]);
    expect(DEFAULT_HOUSE_SYSTEM).toBe("koch");
    const html = render(<HouseSystemSelector value={DEFAULT_HOUSE_SYSTEM} onChange={() => {}} />);
    const buttons = tagsWith(html, "button", "data-house-system");
    expect(buttons.map((b) => b["data-house-system"])).toEqual(["koch", "whole-sign", "placidus"]);
    expect(textOf(html)).toContain("House system Koch Whole Sign Placidus");
  });

  it("marks only the selected system as pressed", () => {
    for (const system of HOUSE_SYSTEMS) {
      const html = render(<HouseSystemSelector value={system} onChange={() => {}} />);
      const pressed = tagsWith(html, "button", "data-house-system").filter((b) => b["aria-pressed"] === "true");
      expect(pressed.map((b) => b["data-house-system"])).toEqual([system]);
    }
  });

  it("labels the group and shows the system names in Russian", async () => {
    await initI18n("ru");
    const html = render(<HouseSystemSelector value="koch" onChange={() => {}} />);
    await initI18n("en");
    expect(textOf(html)).toContain("Система домов Кох Целые знаки Плацидус");
    expect(html).toContain('role="group"');
    expect(html).not.toMatch(RAW_KEY);
  });
});

describe("chart context line (REQ-001)", () => {
  it("shows the local date, time, timezone, UTC instant, place and coordinates used for chart A", () => {
    const text = textOf(
      render(<ChartContextLine chart={charts.A} birthDate="2002-03-30" birthTime="03:30" placeName="Cape Town (ZA)" relocated={false} />),
    );
    expect(text).toContain("Calculated for");
    expect(text).toContain("2002-03-30");
    expect(text).toContain("03:30 local (Africa/Johannesburg, 01:30 UTC)");
    expect(text).toContain("Cape Town (ZA)");
    expect(text).toContain("33°56′S 18°25′E");
    expect(text).not.toContain("estimated");
  });

  it("shows chart B in the northern and eastern hemisphere", () => {
    const text = textOf(
      render(<ChartContextLine chart={charts.B} birthDate="1999-09-25" birthTime="07:24" placeName="Riyadh (SA)" relocated={false} />),
    );
    expect(text).toContain("07:24 local (Asia/Riyadh, 04:24 UTC)");
    expect(text).toContain("24°43′N 46°41′E");
  });

  it("marks a relocated place and uses the coordinates the chart was calculated for", () => {
    const relocated: ChartResult = { ...charts.A, context: { ...charts.A.context!, lat: 55.7558, lng: 37.6173 } };
    const text = textOf(
      render(<ChartContextLine chart={relocated} birthDate="2002-03-30" birthTime="03:30" placeName="Moscow" relocated />),
    );
    expect(text).toContain("Moscow (relocated)");
    expect(text).toContain("55°45′N 37°37′E");
    expect(text).toContain("03:30 local (Africa/Johannesburg, 01:30 UTC)");
  });

  it("says local noon was estimated and that angles, cusps and houses are withheld when the birth time is unknown", () => {
    const text = textOf(
      render(<ChartContextLine chart={charts.unknownTime} birthDate="1990-06-15" birthTime={null} placeName="London" relocated={false} />),
    );
    expect(text).toContain("12:00 local noon, estimated (Europe/London, 11:00 UTC)");
    expect(text).toContain("The Ascendant, Midheaven, house cusps and house numbers are not calculated.");
    expect(text).toContain("51°30′N 0°08′W");
  });

  it("renders in Russian without leaking translation keys", async () => {
    await initI18n("ru");
    const known = render(<ChartContextLine chart={charts.A} birthDate="2002-03-30" birthTime="03:30" placeName="Кейптаун" relocated={false} />);
    const unknown = render(<ChartContextLine chart={charts.unknownTime} birthDate="1990-06-15" birthTime={null} placeName="Лондон" relocated />);
    await initI18n("en");
    expect(textOf(known)).toContain("Расчёт для");
    expect(textOf(known)).toContain("03:30 местное (Africa/Johannesburg, 01:30 UTC)");
    expect(textOf(unknown)).toContain("12:00 местного полудня, оценка");
    expect(textOf(unknown)).toContain("Лондон (релокация)");
    expect(textOf(unknown)).toContain("не рассчитываются");
    expect(known + unknown).not.toMatch(RAW_KEY);
  });

  it("formats coordinates in degrees and minutes with the hemisphere", () => {
    expect(formatCoordinates(-33.933333, 18.416667)).toBe("33°56′S 18°25′E");
    expect(formatCoordinates(40.716667, -74)).toBe("40°43′N 74°00′W");
    expect(formatCoordinates(0, 0)).toBe("0°00′N 0°00′E");
    expect(formatUtcTime("2002-03-30T01:30:00.000Z")).toBe("01:30");
    expect(formatUtcTime("not a date")).toBe("");
  });
});

describe("Houses tab house system (REQ-001)", () => {
  it("names the system actually used", () => {
    const text = textOf(render(<HouseAreasView chart={charts.A} />));
    expect(text).toContain("House system: Whole Sign");
    expect(text).not.toContain("Requested:");
    expect(textOf(render(<HouseAreasView chart={charts.C} />))).toContain("House system: Koch");
    expect(textOf(render(<HouseAreasView chart={charts.D} />))).toContain("House system: Placidus");
  });

  it("tells the requested system from the actual one when the calculation fell back to Whole Sign", () => {
    const html = render(<HouseAreasView chart={charts.fallback} />);
    const text = textOf(html);
    expect(text).toContain("House system: Whole Sign");
    expect(text).toContain("Requested: Placidus — calculated with Whole Sign.");
    expect(text).toContain("Placidus cannot be calculated for this place, so the chart uses Whole Sign.");
    expect(html).toContain('role="status"');
  });

  it("withholds houses and cusps when the birth time is unknown", () => {
    const html = render(<HouseAreasView chart={charts.unknownTime} />);
    const text = textOf(html);
    expect(text).toContain("the houses, house cusps and the Ascendant and Midheaven are not calculated");
    expect(text).not.toContain("House system:");
    expect(text).not.toContain("Cusp");
    expect(html).not.toMatch(RAW_KEY);
  });

  it("says the same in Russian without leaking translation keys", async () => {
    await initI18n("ru");
    const html = render(<HouseAreasView chart={charts.fallback} />);
    await initI18n("en");
    const text = textOf(html);
    expect(text).toContain("Система домов: Целые знаки");
    expect(text).toContain("Запрошено: Плацидус — рассчитано по системе «Целые знаки».");
    expect(html).not.toMatch(RAW_KEY);
  });
});

describe("house of a longitude", () => {
  const cusps = [300, 330, 0, 30, 60, 90, 120, 150, 180, 210, 240, 270];

  it("finds the house of a longitude, including across 0 degrees Aries", () => {
    expect(houseOfLongitude(324.98, cusps)).toBe(1);
    expect(houseOfLongitude(230.62, cusps)).toBe(10);
    expect(houseOfLongitude(10, cusps)).toBe(3);
    expect(houseOfLongitude(299.9, cusps)).toBe(12);
  });

  it("puts a longitude that sits on a cusp, up to rounding error, into the house that starts there", () => {
    expect(houseOfLongitude(300, cusps)).toBe(1);
    expect(houseOfLongitude(300 - 1e-12, cusps)).toBe(1);
    expect(houseOfLongitude(0, cusps)).toBe(3);
    expect(houseOfLongitude(360, cusps)).toBe(3);
  });

  it("returns null for a malformed cusp list", () => {
    expect(houseOfLongitude(10, [])).toBeNull();
  });
});

describe("profile wiring (REQ-001)", () => {
  const source = readFileSync(join(__dirname, "..", "..", "..", "pages", "ProfileDetail.tsx"), "utf-8");

  it("requests the chart with the selected house system and refreshes when it changes", () => {
    expect(source).toMatch(/getChart\(\s*id!,\s*deviceId,\s*houseSystem,/);
    expect(source).not.toMatch(/getChart\([^)]*"koch"/);
    expect(source).toMatch(/useState<HouseSystem>\(DEFAULT_HOUSE_SYSTEM\)/);
    expect(source).toMatch(/relocationLng, houseSystem\]/);
    expect(source).toContain("<HouseSystemSelector value={houseSystem} onChange={setHouseSystem} />");
  });

  it("feeds every chart view from the one chart result", () => {
    for (const view of ["PlanetsTable", "AspectsTable", "AspectMatrix", "ElementModalityGrid", "DegreeStrip", "HouseAreasView"]) {
      expect(source, view).toMatch(new RegExp(`<${view} chart=\\{chartData\\} />`));
    }
    expect(source).toContain("<ChartContextLine");
  });
});
