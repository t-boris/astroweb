import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  generateInterpretations,
  type InterpretationBlock,
} from "@/data/interpretations";
import {
  PLANET_GLYPHS,
  ASPECT_GLYPHS,
  ELEMENT_COLORS,
  ASPECT_COLORS,
} from "@/components/chart/utils/constants";
import type { ChartResult } from "@/types";

interface InterpretationViewProps {
  chart: ChartResult;
}

function getBlockColor(block: InterpretationBlock): string {
  if (block.category === "aspect") {
    return ASPECT_COLORS[block.tags[0]] ?? "#888";
  }
  // For sign categories, first tag is the element
  const element = block.tags[0] as keyof typeof ELEMENT_COLORS;
  return ELEMENT_COLORS[element]?.stroke ?? "#888";
}

export function InterpretationView({ chart }: InterpretationViewProps) {
  const { t } = useTranslation();
  const blocks = useMemo(() => generateInterpretations(chart), [chart]);

  const signBlocks = blocks.filter((b) => b.category !== "aspect");
  const aspectBlocks = blocks.filter((b) => b.category === "aspect");

  return (
    <div className="space-y-6">
      {/* Sign-based interpretation blocks */}
      {signBlocks.map((block) => (
        <div
          key={block.key}
          className="border-l-2 pl-4"
          style={{ borderColor: getBlockColor(block) }}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t(`interpretation.categories.${block.category}`)}
              </span>
            </div>
            <h3 className="text-lg font-semibold">
              {t(`${block.key}.title`)}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t(`${block.key}.text`)}
            </p>
          </div>
        </div>
      ))}

      {/* Separator between sign and aspect blocks */}
      {aspectBlocks.length > 0 && signBlocks.length > 0 && (
        <div className="border-t border-border" />
      )}

      {/* Aspect blocks */}
      {aspectBlocks.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("interpretation.categories.aspect")}
          </span>
        </div>
      )}

      {aspectBlocks.map((block) => {
        const aspect = block.aspect;
        return (
          <div
            key={
              aspect
                ? `${block.key}-${aspect.a}-${aspect.b}`
                : block.key
            }
            className="border-l-2 pl-4"
            style={{ borderColor: getBlockColor(block) }}
          >
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">
                <span style={{ color: getBlockColor(block) }}>
                  {ASPECT_GLYPHS[block.tags[0]] ?? ""}{" "}
                </span>
                {t(`${block.key}.title`)}
              </h3>
              {aspect && (
                <p className="text-sm font-medium">
                  {PLANET_GLYPHS[aspect.a] ?? ""} {aspect.a}{" "}
                  {ASPECT_GLYPHS[aspect.type] ?? ""}{" "}
                  {PLANET_GLYPHS[aspect.b] ?? ""} {aspect.b}{" "}
                  <span className="text-muted-foreground">
                    ({aspect.orb.toFixed(1)}&deg; orb)
                  </span>
                </p>
              )}
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t(`${block.key}.text`)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
