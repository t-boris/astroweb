import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  ASPECT_COLORS,
  ASPECT_GLYPHS,
  MAJOR_ASPECT_TYPES,
  MINOR_ASPECT_TYPES,
  ALL_ASPECT_TYPES,
  DEFAULT_ASPECT_TYPES,
} from "@astroweb/chart-core";
import { aspectHelpKey } from "@/lib/helpKeys";
import { HelpBubble } from "@/components/HelpBubble";

interface AspectFiltersProps {
  activeFilters: Set<string>;
  onToggle: (type: string) => void;
  /** Show every aspect type of the shared set. The button is drawn only when this is given. */
  onShowAll?: () => void;
  /** Back to the default selection (the five major aspects). The button is drawn only when this is given. */
  onReset?: () => void;
}

const ACTION_BUTTON =
  "rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-white/80 transition-all duration-200 hover:border-white/40 disabled:cursor-default disabled:opacity-40 disabled:hover:border-white/15";

/**
 * One toggle per aspect type of the shared set, in two groups (major and minor), with "show all"
 * and "reset". Toggling only changes which aspects are visible, never the calculated set (DEC-011).
 */
export default function AspectFilters({
  activeFilters,
  onToggle,
  onShowAll,
  onReset,
}: AspectFiltersProps) {
  const { t } = useTranslation();

  const allShown = ALL_ASPECT_TYPES.every((type) => activeFilters.has(type));
  const isDefault =
    activeFilters.size === DEFAULT_ASPECT_TYPES.length &&
    DEFAULT_ASPECT_TYPES.every((type) => activeFilters.has(type));

  const groups = [
    { id: "major", label: t("natalWheel.filters.major"), types: MAJOR_ASPECT_TYPES },
    { id: "minor", label: t("natalWheel.filters.minor"), types: MINOR_ASPECT_TYPES },
  ];

  return (
    <div className="mt-4 space-y-3">
      {groups.map((group) => (
        <div
          key={group.id}
          role="group"
          aria-label={group.label}
          data-filter-group={group.id}
          className="flex flex-wrap items-center justify-center gap-2"
        >
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{group.label}</span>
          {group.types.map((type) => {
            const typeLabel = t(`chart.aspects.${type}`);
            return (
              <HelpBubble key={type} helpKey={aspectHelpKey(type)} actionable label={typeLabel}>
                <button
                  type="button"
                  onClick={() => onToggle(type)}
                  aria-pressed={activeFilters.has(type)}
                  data-aspect-filter={type}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200",
                    activeFilters.has(type)
                      ? "border-current opacity-100"
                      : "border-white/10 opacity-40",
                  )}
                  style={{
                    color: ASPECT_COLORS[type],
                  }}
                >
                  <span>{ASPECT_GLYPHS[type]}</span>
                  <span>{typeLabel}</span>
                </button>
              </HelpBubble>
            );
          })}
        </div>
      ))}

      {(onShowAll || onReset) && (
        <div className="flex flex-wrap justify-center gap-2">
          {onShowAll && (
            <button type="button" className={ACTION_BUTTON} onClick={onShowAll} disabled={allShown}>
              {t("natalWheel.filters.showAll")}
            </button>
          )}
          {onReset && (
            <button type="button" className={ACTION_BUTTON} onClick={onReset} disabled={isDefault}>
              {t("natalWheel.filters.reset")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
