/**
 * The pinned point of the wheel. A click or tap on a point or axis pins its tooltip so it works without
 * hovering; it must also be possible to let it go: a click anywhere else, or the Escape key.
 */

/** What a click target must offer to be asked whether it is a point or an axis (an `Element`). */
interface MarkerCandidate {
  closest(selector: string): unknown;
}

/** The wheel's `svg`, used to tell its own points from anything else on the page that merely carries the attribute. */
interface WheelRoot {
  contains(node: unknown): boolean;
}

/** Points and axes carry these attributes (PlanetMarkers, AngleAxes). */
export const MARKER_SELECTOR = "[data-point], [data-angle]";

/** True when the click landed on one of the wheel's own points or axes: that click has its own select/unselect rule. */
export function isWheelMarker(target: unknown, wheel: WheelRoot | null): boolean {
  if (!wheel || !target || typeof (target as MarkerCandidate).closest !== "function") return false;
  if (!wheel.contains(target)) return false;
  return Boolean((target as MarkerCandidate).closest(MARKER_SELECTOR));
}

/** A click keeps the pinned point only when it is on a point or axis of the wheel; anywhere else lets it go. */
export function clickReleasesPinned(target: unknown, wheel: WheelRoot | null): boolean {
  return !isWheelMarker(target, wheel);
}

export function keyReleasesPinned(key: string): boolean {
  return key === "Escape";
}
