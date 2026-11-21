import { useCallback, useState } from "react";
import type { SharedAspect } from "@/types";
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

export interface AspectFilterState {
  activeFilters: Set<string>;
  onToggle: (type: string) => void;
  /** Reveal the full shared set (every type visible). */
  onShowAll: () => void;
  /** Back to the default selection. */
  onReset: () => void;
}

export function useAspectFilters(initial: readonly string[] = DEFAULT_ASPECT_TYPES): AspectFilterState {
  const [activeFilters, setActive] = useState<Set<string>>(() => new Set(initial));

  const onToggle = useCallback((type: string) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);
  const onShowAll = useCallback(() => setActive(new Set(ALL_ASPECT_TYPES)), []);
  const onReset = useCallback(() => setActive(new Set(initial)), [initial]);

  return { activeFilters, onToggle, onShowAll, onReset };
}
