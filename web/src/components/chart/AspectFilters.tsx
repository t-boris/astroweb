import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { ASPECT_COLORS, ASPECT_GLYPHS } from "./utils/constants";

interface AspectFiltersProps {
  activeFilters: Set<string>;
  onToggle: (type: string) => void;
}

const ASPECT_TYPES = [
  "conjunction",
  "opposition",
  "trine",
  "square",
  "sextile",
];

export default function AspectFilters({
  activeFilters,
  onToggle,
}: AspectFiltersProps) {
  const { t } = useTranslation();

  return (
    <div className="mt-4 flex flex-wrap justify-center gap-2">
      {ASPECT_TYPES.map((type) => (
        <button
          key={type}
          onClick={() => onToggle(type)}
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
          <span>{t(`chart.aspects.${type}`)}</span>
        </button>
      ))}
    </div>
  );
}
