import { describe, expect, it } from "vitest";
import {
  HELP_CLOSE_DELAY_MS,
  HELP_OPEN_DELAY_MS,
  helpReducer,
  helpRole,
  isHoverPointer,
  opensOnFocus,
  opensOnTap,
  takesFocus,
  type HelpEvent,
  type HelpState,
} from "@/lib/helpBubble";

/** Runs events from a closed bubble and returns the state after each one. */
function run(...events: HelpEvent["type"][]): HelpState[] {
  const states: HelpState[] = [];
  let state: HelpState = null;
  for (const type of events) {
    state = helpReducer(state, { type });
    states.push(state);
  }
  return states;
}

describe("help bubble rules (REQ-005, DEC-002)", () => {
  it("only a mouse hovers: touch and pen never start the hover timer", () => {
    expect(isHoverPointer("mouse")).toBe(true);
    expect(isHoverPointer("touch")).toBe(false);
    expect(isHoverPointer("pen")).toBe(false);
  });

  it("a tap opens help only on non-actionable elements and only from touch or pen", () => {
    expect(opensOnTap("touch", false)).toBe(true);
    expect(opensOnTap("pen", false)).toBe(true);
    expect(opensOnTap("mouse", false)).toBe(false);
    // Tabs, filters and buttons keep their own action; the "?" button opens help instead.
    expect(opensOnTap("touch", true)).toBe(false);
    expect(opensOnTap("pen", true)).toBe(false);
  });

  it("focus opens only after a key press: a click into a field, or a script's focus() after a click, does not", () => {
    expect(opensOnFocus(true)).toBe(true);
    expect(opensOnFocus(false)).toBe(false);
  });

  it("hover opens after the delay and closes when the pointer leaves", () => {
    expect(run("hoverStart", "hoverEnd")).toEqual(["hover", null]);
  });

  it("keyboard focus opens and blur closes", () => {
    expect(run("focusVisible", "blur")).toEqual(["focus", null]);
  });

  it("Escape (dismiss) closes any bubble", () => {
    expect(run("hoverStart", "dismiss")).toEqual(["hover", null]);
    expect(run("focusVisible", "dismiss")).toEqual(["focus", null]);
    expect(run("tap", "dismiss")).toEqual(["tap", null]);
  });

  it("a tap toggles the bubble, and an outside tap (dismiss) closes it", () => {
    expect(run("tap", "tap")).toEqual(["tap", null]);
    expect(run("tap", "dismiss", "tap")).toEqual(["tap", null, "tap"]);
  });

  it("leaving with the mouse does not close a bubble opened by keyboard or tap", () => {
    expect(run("focusVisible", "hoverEnd")).toEqual(["focus", "focus"]);
    expect(run("tap", "hoverEnd")).toEqual(["tap", "tap"]);
  });

  it("keyboard focus does not downgrade a bubble opened on purpose, and hover does not replace it", () => {
    expect(run("tap", "focusVisible")).toEqual(["tap", "tap"]);
    expect(run("tap", "hoverStart")).toEqual(["tap", "tap"]);
  });

  it("blur only closes a keyboard bubble", () => {
    expect(run("hoverStart", "blur")).toEqual(["hover", "hover"]);
    expect(run("tap", "blur")).toEqual(["tap", "tap"]);
  });

  it("passive bubbles are tooltips that keep focus; a tapped one is a dialog that takes focus", () => {
    expect(helpRole("hover")).toBe("tooltip");
    expect(helpRole("focus")).toBe("tooltip");
    expect(helpRole("tap")).toBe("dialog");
    expect(takesFocus("hover")).toBe(false);
    expect(takesFocus("focus")).toBe(false);
    expect(takesFocus("tap")).toBe(true);
  });

  it("hover is delayed so the interface stays calm (DEC-005)", () => {
    expect(HELP_OPEN_DELAY_MS).toBeGreaterThanOrEqual(250);
    expect(HELP_CLOSE_DELAY_MS).toBeLessThan(HELP_OPEN_DELAY_MS);
  });
});
