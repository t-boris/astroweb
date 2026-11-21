import type { SharedAspect } from "./types";
import { MAJOR_ASPECT_TYPES, MINOR_ASPECT_TYPES } from "./constants";

/** Every aspect type of the shared set, majors first. */
export const ALL_ASPECT_TYPES: string[] = [...MAJOR_ASPECT_TYPES, ...MINOR_ASPECT_TYPES];

/** Types visible when a view opens: the five major aspects, as the wheel did before the minors existed. */
export const DEFAULT_ASPECT_TYPES: string[] = [...MAJOR_ASPECT_TYPES];

/**
 * Filters hide aspects from a view; they never change the calculated set (DEC-011).
 * The aspect list, the matrix and the wheel all go through this one function.
 */
export function filterAspects(aspects: SharedAspect[], active: ReadonlySet<string>): SharedAspect[] {
  return aspects.filter((aspect) => active.has(aspect.type));
}
