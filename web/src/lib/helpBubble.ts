/**
 * Open/close rules of the help bubble (REQ-005, DEC-002, DEC-005, DEC-006).
 *
 * Pure on purpose: the component wires DOM events and timers to these rules, and
 * the rules are tested in Node. Help is always on (no setting) and never tracked
 * (no analytics event is emitted anywhere in this feature).
 */

/** How the bubble was opened. It decides focus handling and the ARIA role. */
export type HelpSource = "hover" | "focus" | "tap";

/** `null` = closed. */
export type HelpState = HelpSource | null;

export type HelpEvent =
  | { type: "hoverStart" }
  | { type: "hoverEnd" }
  | { type: "focusVisible" }
  | { type: "blur" }
  | { type: "tap" }
  | { type: "dismiss" };

/** Hover must stay on the element this long before the bubble opens (DEC-005: unobtrusive). */
export const HELP_OPEN_DELAY_MS = 350;
/** Grace period that lets the pointer travel from the element onto the bubble. */
export const HELP_CLOSE_DELAY_MS = 150;

/** Only a mouse hovers. Touch and pen contact does not, so they never start the hover timer. */
export function isHoverPointer(pointerType: string): boolean {
  return pointerType === "mouse";
}

/**
 * A tap on the element itself opens help only when the element has no action of
 * its own (DEC-002). Actionable elements get a separate "?" button on touch.
 */
export function opensOnTap(pointerType: string, actionable: boolean): boolean {
  return !actionable && (pointerType === "touch" || pointerType === "pen");
}

/**
 * Keyboard focus opens the bubble: the last input was a key press. A mouse or touch focus does not (hover and tap
 * already cover them), and neither does a script's focus() that follows a click, e.g. when focus is handed back to
 * the element after a bubble closes.
 */
export function opensOnFocus(lastInputWasKeyboard: boolean): boolean {
  return lastInputWasKeyboard;
}

export function helpReducer(state: HelpState, event: HelpEvent): HelpState {
  switch (event.type) {
    case "hoverStart":
      return state ?? "hover";
    case "hoverEnd":
      // Leaving the element closes a hover bubble only; a tap or keyboard bubble stays.
      return state === "hover" ? null : state;
    case "focusVisible":
      // Keyboard focus never downgrades a bubble the user opened on purpose.
      return state === "tap" ? state : "focus";
    case "blur":
      return state === "focus" ? null : state;
    case "tap":
      return state === "tap" ? null : "tap";
    case "dismiss":
      return null;
  }
}

/** Passive bubbles (hover, focus) describe the element; a tapped bubble is a small dialog. */
export function helpRole(source: HelpSource | null): "tooltip" | "dialog" {
  return source === "tap" ? "dialog" : "tooltip";
}

/** Only a bubble opened on purpose takes focus, so screen readers read it; passive ones keep focus on the element. */
export function takesFocus(source: HelpSource | null): boolean {
  return source === "tap";
}
