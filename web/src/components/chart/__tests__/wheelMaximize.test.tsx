import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import NatalChart from "@/components/chart/NatalChart";
import MaximizedWheel, { MAXIMIZED_WHEEL_SIZE } from "@/components/chart/MaximizedWheel";
import { clickReleasesPinned } from "@/components/chart/wheelSelection";
import { loadFixtures } from "@astroweb/chart-core/test-fixtures";

/** The chart can be maximised: a button on the wheel opens it over the whole window, and it closes again. */

const { charts } = loadFixtures();
const WEB = join(__dirname, "..", "..", "..", "..");
const locale = (lang: "en" | "ru") =>
  JSON.parse(readFileSync(join(WEB, "public", "locales", lang, "translation.json"), "utf-8")) as { natalWheel: Record<string, string> };
const en = locale("en");
const ru = locale("ru");

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    resources: { en: { translation: en }, ru: { translation: ru } },
  });
});

const chartMarkup = () => renderToStaticMarkup(<NatalChart chart={Object.values(charts)[0]} />);

describe("the maximise button", () => {
  it("is on the wheel with an accessible name and a tooltip", async () => {
    await i18next.changeLanguage("en");
    const html = chartMarkup();
    const button = html.match(/<button[^>]*data-wheel-maximize[^>]*>/)?.[0] ?? "";
    expect(button).toContain(`aria-label="${en.natalWheel.maximize}"`);
    expect(button).toContain(`title="${en.natalWheel.maximize}"`);
    expect(button).toContain('type="button"');
  });

  it("is named in Russian when the language is Russian", async () => {
    await i18next.changeLanguage("ru");
    const html = chartMarkup();
    expect(html).toContain(`aria-label="${ru.natalWheel.maximize}"`);
    expect(ru.natalWheel.maximize).not.toBe(en.natalWheel.maximize);
    await i18next.changeLanguage("en");
  });

  it("has a name in both languages for the dialog and its close button", () => {
    for (const lang of [en, ru]) {
      expect(lang.natalWheel.maximizedLabel).toBeTruthy();
      expect(lang.natalWheel.closeMaximized).toBeTruthy();
    }
  });
});

describe("the maximised view before it is opened", () => {
  it("is a closed dialog with a close button and no second wheel (one picture, no duplicated drawing)", async () => {
    await i18next.changeLanguage("en");
    const html = chartMarkup();
    expect(html).toContain('<dialog');
    expect(html).toContain('data-wheel-maximized="closed"');
    expect(html).toContain(`aria-label="${en.natalWheel.closeMaximized}"`);
    expect((html.match(/role="img"/g) ?? []).length).toBe(1);
  });
});

describe("MaximizedWheel", () => {
  const props = { onClose: () => {}, label: "Chart", closeLabel: "Close" };

  it("holds the wheel only while it is open", () => {
    const closed = renderToStaticMarkup(<MaximizedWheel {...props} open={false}><p id="wheel">wheel</p></MaximizedWheel>);
    const open = renderToStaticMarkup(<MaximizedWheel {...props} open><p id="wheel">wheel</p></MaximizedWheel>);
    expect(closed).not.toContain('id="wheel"');
    expect(open).toContain('id="wheel"');
    expect(open).toContain('data-wheel-maximized="open"');
  });

  it("is a labelled modal dialog that fills the window and shows only when open", () => {
    const html = renderToStaticMarkup(<MaximizedWheel {...props} open><p>wheel</p></MaximizedWheel>);
    expect(html).toContain('aria-label="Chart"');
    // `flex` applies only to an open dialog; a closed one stays hidden by the browser.
    expect(html).toMatch(/class="[^"]*\bopen:flex\b/);
    expect(html).not.toMatch(/class="[^"]*(?<![:\w-])flex\b/);
    expect(html).toMatch(/\bh-dvh\b/);
    expect(html).toMatch(/\bw-dvw\b/);
  });

  it("has a close button with a name", () => {
    const html = renderToStaticMarkup(<MaximizedWheel {...props} open><p>wheel</p></MaximizedWheel>);
    expect(html).toMatch(/<button[^>]*aria-label="Close"[^>]*>/);
  });

  it("sizes the wheel by the smaller side of the window, with a margin", () => {
    expect(MAXIMIZED_WHEEL_SIZE).toContain("100vw");
    expect(MAXIMIZED_WHEEL_SIZE).toContain("100dvh");
    expect(MAXIMIZED_WHEEL_SIZE.startsWith("min(")).toBe(true);
  });
});

describe("the pinned point with two wheels on the page", () => {
  const marker = { closest: (selector: string) => (selector.includes("data-point") ? {} : null) };
  const wheelOf = (...nodes: unknown[]) => ({ contains: (node: unknown) => nodes.includes(node) });

  it("keeps the pin for a click on a marker of the maximised wheel, not only of the page's", () => {
    const pageWheel = wheelOf();
    const bigWheel = wheelOf(marker);
    expect(clickReleasesPinned(marker, [pageWheel, bigWheel])).toBe(false);
    expect(clickReleasesPinned(marker, [bigWheel, null])).toBe(false);
  });

  it("releases it for a marker that belongs to neither wheel and when no wheel is mounted", () => {
    expect(clickReleasesPinned(marker, [wheelOf(), wheelOf()])).toBe(true);
    expect(clickReleasesPinned(marker, [null, null])).toBe(true);
    expect(clickReleasesPinned(marker, [])).toBe(true);
  });
});
