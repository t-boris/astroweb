import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { HelpBubble } from "@/components/HelpBubble";
import { HelpPointerContext, type PointerKind } from "@/lib/helpPointer";

/**
 * Closed-state markup of the shared help component (REQ-005). The open state lives in a
 * portal, so hover, focus, Escape and tap are covered by the pure rules in
 * lib/__tests__/helpBubble.test.ts and by the browser walkthrough.
 */
/** Renders as a device with the given primary pointer: "fine" is a mouse, "coarse" is a finger. */
function onDevice(kind: PointerKind, node: React.ReactNode): string {
  return renderToStaticMarkup(<HelpPointerContext.Provider value={kind}>{node}</HelpPointerContext.Provider>);
}

const HELP_TEXT = "Orb is the allowed distance from an exact aspect. A smaller orb means a stronger link.";

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    resources: {
      en: { translation: { help: { demo: HELP_TEXT, ui: { title: "Help", open: "What is this?", openFor: "About {{term}}" } } } },
      ru: { translation: { help: { demo: "Орбис - допустимое отклонение от точного аспекта.", ui: { title: "Справка", open: "Что это?", openFor: "О понятии {{term}}" } } } },
    },
  });
});

describe("HelpBubble markup", () => {
  it("a plain-text term is keyboard-focusable and does not show the bubble until it is opened", () => {
    const html = renderToStaticMarkup(
      <HelpBubble helpKey="demo">
        <span>Orb</span>
      </HelpBubble>,
    );
    expect(html).toContain("Orb");
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("cursor-help");
    expect(html).not.toContain("<button");
    expect(html).not.toContain(HELP_TEXT);
    expect(html).not.toContain("aria-describedby");
  });

  it("on a pointer device an actionable element is rendered alone: same DOM and spacing as before", () => {
    const html = onDevice(
      "fine",
      <HelpBubble helpKey="demo" actionable label="Chart">
        <button type="button">Chart</button>
      </HelpBubble>,
    );
    expect(html).toMatch(/^<button type="button"[^>]*>Chart<\/button>$/);
    expect(html).not.toContain('tabindex="0"');
  });

  it("on a touch device an actionable element keeps its own markup and gets a named '?' button beside it", () => {
    const html = onDevice(
      "coarse",
      <HelpBubble helpKey="demo" actionable label="Chart">
        <button type="button">Chart</button>
      </HelpBubble>,
    );
    expect(html).toMatch(/^<span class="inline-flex items-center gap-1"><button type="button"[^>]*>Chart<\/button><button[^>]*aria-label="About Chart"[^>]*>/);
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('tabindex="0"');
  });

  it("keeps the roving tabindex of an actionable child (Radix tabs spread their props after their own tabIndex)", () => {
    function RovingItem(props: React.ComponentProps<"button">) {
      return <button type="button" tabIndex={-1} {...props} />;
    }
    for (const kind of ["fine", "coarse"] as const) {
      const html = onDevice(
        kind,
        <HelpBubble helpKey="demo" actionable>
          <RovingItem>Tab</RovingItem>
        </HelpBubble>,
      );
      expect(html, kind).toMatch(/<button type="button" tabindex="-1"[^>]*>Tab<\/button>/);
    }
  });

  it("lets a wide control keep its width on touch: the wrapper takes the caller's classes", () => {
    const html = onDevice(
      "coarse",
      <HelpBubble helpKey="demo" actionable wrapperClassName="flex">
        <button type="button" className="w-full">Go</button>
      </HelpBubble>,
    );
    const wrapperClass = html.match(/^<span class="([^"]*)"/)?.[1] ?? "";
    expect(wrapperClass).toContain("flex");
    // tailwind-merge drops the conflicting default, so only one display class applies
    expect(wrapperClass).not.toContain("inline-flex");
  });

  it("a badge '?' takes no room beside the element: it is a positioned overlay with a 24px hit area", () => {
    const html = onDevice(
      "coarse",
      <HelpBubble helpKey="demo" actionable badge label="Stars">
        <button type="button">5</button>
      </HelpBubble>,
    );
    expect(html).toMatch(/^<span class="relative inline-flex"><button type="button"[^>]*>5<\/button><button /);
    const question = html.match(/<button [^>]*aria-label="About Stars"[^>]*>/)?.[0] ?? "";
    expect(question).toMatch(/class="[^"]*\babsolute\b/);
    expect(question).toMatch(/class="[^"]*\bsize-4\b/);
    expect(html).toContain("before:-inset-1");
    // on a pointer device the badge variant renders nothing extra either
    expect(onDevice("fine", <HelpBubble helpKey="demo" actionable badge><button type="button">5</button></HelpBubble>)).toMatch(/^<button type="button"[^>]*>5<\/button>$/);
  });

  it("renders the element untouched when it is disabled (repeated labels get help on the first row only)", () => {
    const bare = renderToStaticMarkup(<span>Orb</span>);
    const html = renderToStaticMarkup(
      <HelpBubble helpKey="demo" enabled={false}>
        <span>Orb</span>
      </HelpBubble>,
    );
    expect(html).toBe(bare);
  });

  it("without a label the '?' button uses the generic name", () => {
    const html = onDevice(
      "coarse",
      <HelpBubble helpKey="demo" actionable>
        <button type="button">Go</button>
      </HelpBubble>,
    );
    expect(html).toContain('aria-label="What is this?"');
  });

  it("renders the element untouched when the help key has no text", () => {
    const bare = renderToStaticMarkup(<span>Orb</span>);
    const html = renderToStaticMarkup(
      <HelpBubble helpKey="doesNotExist">
        <span>Orb</span>
      </HelpBubble>,
    );
    expect(html).toBe(bare);
  });

  it("the '?' button is named in the active language", async () => {
    await i18next.changeLanguage("ru");
    const html = onDevice(
      "coarse",
      <HelpBubble helpKey="demo" actionable label="Орбис">
        <button type="button">Орбис</button>
      </HelpBubble>,
    );
    await i18next.changeLanguage("en");
    expect(html).toContain('aria-label="О понятии Орбис"');
  });
});
