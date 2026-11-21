import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import i18next from "i18next";
import { BigThree } from "@/components/chart/BigThree";
import { buildBigThree } from "@/components/chart/bigThreeModel";
import { hexToRgba } from "@/components/chart/utils/elementColors";
import { charts, initI18n, textOf } from "./tablesTestSupport";

/** The Big Three strip: the model behind it and the first paint of the card (the page owns the pick and the tab). */

beforeAll(async () => {
  await initI18n("en");
});

const noop = () => {};
const render = (chart = charts.A, defaultExpanded = false) =>
  renderToStaticMarkup(<BigThree chart={chart} onOpenReading={noop} editHref="/profile/x/edit" defaultExpanded={defaultExpanded} />);

describe("buildBigThree", () => {
  it("returns the Sun, the Moon and the Rising sign in this order with sign, degree, element, modality and house", () => {
    const [sun, moon, rising] = buildBigThree(charts.A);
    expect(buildBigThree(charts.A).map((i) => i.id)).toEqual(["sun", "moon", "rising"]);
    expect(sun).toMatchObject({ sign: "Aries", element: "fire", modality: "cardinal", house: 3, textKey: "interpretation.sun.aries" });
    expect(sun.degree).toMatch(/^\d{1,2}°\d{2}′$/);
    expect(moon).toMatchObject({ sign: "Libra", element: "air", modality: "cardinal", house: 9, textKey: "interpretation.moon.libra" });
    // The ascendant of the fixture is 324.98°: Aquarius, and the Rising sign is the first house by definition.
    expect(rising).toMatchObject({ sign: "Aquarius", element: "air", modality: "fixed", house: 1, textKey: "interpretation.ascendant.aquarius" });
  });

  it("gives the Rising sign no sign for a chart calculated for local noon", () => {
    const [sun, moon, rising] = buildBigThree(charts.unknownTime);
    expect(sun.sign).toBe("Gemini");
    expect(moon.sign).toBe("Pisces");
    expect(sun.house).toBeNull();
    expect(rising).toMatchObject({ sign: null, element: null, modality: null, degree: null, house: null, textKey: null });
  });

  it("points every text key at an existing English and Russian reading", async () => {
    for (const lng of ["en", "ru"] as const) {
      await initI18n(lng);
      for (const name of ["A", "B", "C", "D", "unknownTime"] as const) {
        for (const item of buildBigThree(charts[name])) {
          if (!item.textKey) continue;
          expect(i18next.exists(`${item.textKey}.text`), `${lng} ${item.textKey}`).toBe(true);
        }
      }
    }
    await initI18n("en");
  });
});

describe("BigThree on the page", () => {
  it("shows three cards and a one-line explanation of the Sun, with the details closed", () => {
    const html = render();
    expect(html.match(/<button[^>]*aria-pressed/g)).toHaveLength(3);
    expect(html).toMatch(/aria-pressed="true"[^>]*>(?:(?!<\/button>).)*Sun/s);
    expect(html).toContain('aria-expanded="false"');
    const text = textOf(html);
    expect(text).toContain("The Big Three");
    expect(text).toContain("Your core");
    expect(text).toContain("— Who you are, what drives you");
    expect(text).toContain("Details");
    // The page is compact: the reading, the chips and the link stay closed until asked for.
    expect(text).not.toContain("Full reading");
    expect(text).not.toContain(i18next.t("interpretation.sun.aries.text"));
    expect(html).not.toContain("line-clamp-4");
  });

  it("opens the element, modality, house and the sign's reading with a link to the full reading", () => {
    const html = render(charts.A, true);
    expect(html).toContain('aria-expanded="true"');
    const text = textOf(html);
    expect(text).toContain("Aries");
    expect(text).toContain("Fire");
    expect(text).toContain("Cardinal");
    expect(text).toContain("House 3");
    expect(text).toContain(i18next.t("interpretation.sun.aries.text"));
    expect(text).toContain("Full reading");
    expect(text).toContain("Less");
  });

  it("turns the orbit and the glow into CSS classes that the reduced-motion rule can stop", () => {
    const html = render();
    expect(html).toContain("bt-orbit");
    expect(html).toContain("bt-glow");
    expect(html).toContain("--bt-orbit-s");
  });

  it("marks the Rising card as unknown when the birth time is unknown", () => {
    const text = textOf(render(charts.unknownTime));
    expect(text).toContain("Unknown");
    expect(text).toContain("Rising");
    expect(text).not.toContain("House 1");
  });

  it("speaks Russian and leaks no translation key", async () => {
    await initI18n("ru");
    const text = textOf(render(charts.A, true));
    await initI18n("en");
    expect(text).toContain("Большая тройка");
    expect(text).toContain("Ваше ядро");
    expect(text).toContain("3-й дом");
    expect(text).toContain("Полная трактовка");
    expect(text).toContain("Свернуть");
    expect(text).not.toMatch(/\b(bigThree|interpretation|natalChart)\.[A-Za-z]+/);
  });

  it("has the same texts in both languages", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const load = (lng: string) =>
      JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "..", "public", "locales", lng, "translation.json"), "utf-8")).bigThree;
    const keys = (o: Record<string, unknown>, prefix = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) => (typeof v === "object" && v !== null ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`]));
    expect(keys(load("ru")).sort()).toEqual(keys(load("en")).sort());
  });
});

describe("hexToRgba", () => {
  it("converts long and short hex colours", () => {
    expect(hexToRgba("#ef4444", 0.3)).toBe("rgba(239, 68, 68, 0.3)");
    expect(hexToRgba("#fff", 1)).toBe("rgba(255, 255, 255, 1)");
  });
});
