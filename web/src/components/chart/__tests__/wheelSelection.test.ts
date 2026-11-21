import { describe, expect, it } from "vitest";
import { MARKER_SELECTOR, clickReleasesPinned, isWheelMarker, keyReleasesPinned } from "@/components/chart/wheelSelection";

/** The pinned tooltip of the wheel can be let go: a click elsewhere or Escape (the page owns the state). */

/** A stand-in for an element: `closest` answers true for the selector when it is, or sits in, a marker. */
const element = (inMarker: boolean) => ({ closest: (selector: string) => (selector === MARKER_SELECTOR && inMarker ? {} : null) });

/** A wheel that contains exactly the given nodes. */
const wheel = (...nodes: unknown[]) => ({ contains: (node: unknown) => nodes.includes(node) });

describe("which clicks keep the pinned point", () => {
  it("keeps it for a click on a point or an axis of the wheel (they select or unselect by themselves)", () => {
    const marker = element(true);
    expect(isWheelMarker(marker, wheel(marker))).toBe(true);
    expect(clickReleasesPinned(marker, wheel(marker))).toBe(false);
  });

  it("lets it go for a click on an empty part of the wheel", () => {
    const empty = element(false);
    expect(clickReleasesPinned(empty, wheel(empty))).toBe(true);
  });

  it("lets it go for a click outside the wheel, even on an element that carries the same attribute", () => {
    const outside = element(true);
    expect(clickReleasesPinned(outside, wheel())).toBe(true);
    expect(clickReleasesPinned(element(false), wheel())).toBe(true);
  });

  it("lets it go when the target or the wheel is missing, or the target is not an element", () => {
    expect(clickReleasesPinned(null, wheel())).toBe(true);
    expect(clickReleasesPinned(undefined, null)).toBe(true);
    expect(clickReleasesPinned({}, wheel())).toBe(true);
    expect(clickReleasesPinned(element(true), null)).toBe(true);
  });
});

describe("which keys let it go", () => {
  it("is Escape only", () => {
    expect(keyReleasesPinned("Escape")).toBe(true);
    for (const key of ["Enter", "Tab", " ", "a", "ArrowLeft"]) expect(keyReleasesPinned(key)).toBe(false);
  });
});

describe("the markers carry the attributes the selector looks for", () => {
  it("points and axes are drawn with data-point and data-angle", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dir = join(__dirname, "..");
    expect(readFileSync(join(dir, "PlanetMarkers.tsx"), "utf-8")).toContain("data-point=");
    expect(readFileSync(join(dir, "AngleAxes.tsx"), "utf-8")).toContain("data-angle=");
    expect(MARKER_SELECTOR).toBe("[data-point], [data-angle]");
  });
});
