import { useCallback, useState } from "react";
import { ALL_ASPECT_TYPES, DEFAULT_ASPECT_TYPES } from "@astroweb/chart-core";

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
