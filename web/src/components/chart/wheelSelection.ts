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

/** One wheel, or every wheel on the page (the profile page's and the maximised one). */
type Wheels = WheelRoot | null | readonly (WheelRoot | null)[];

function wheelList(wheels: Wheels): (WheelRoot | null)[] {
  return Array.isArray(wheels) ? [...(wheels as readonly (WheelRoot | null)[])] : [wheels as WheelRoot | null];
}

/** True when the click landed on a point or axis of one of the wheels: that click has its own select/unselect rule. */
export function isWheelMarker(target: unknown, wheels: Wheels): boolean {
  if (!target || typeof (target as MarkerCandidate).closest !== "function") return false;
  const inWheel = wheelList(wheels).some((wheel) => wheel !== null && wheel.contains(target));
  return inWheel && Boolean((target as MarkerCandidate).closest(MARKER_SELECTOR));
}

/** A click keeps the pinned point only when it is on a point or axis of a wheel; anywhere else lets it go. */
export function clickReleasesPinned(target: unknown, wheels: Wheels): boolean {
  return !isWheelMarker(target, wheels);
}

export function keyReleasesPinned(key: string): boolean {
  return key === "Escape";
}
