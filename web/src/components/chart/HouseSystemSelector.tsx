import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { houseSystemHelpKey } from "@/lib/helpKeys";
import { HelpBubble } from "@/components/HelpBubble";
import { Label } from "@/components/ui/label";
import { HOUSE_SYSTEMS, houseSystemName, type HouseSystem } from "@/components/chart/utils/viewModel";

interface HouseSystemSelectorProps {
  value: HouseSystem;
  onChange: (system: HouseSystem) => void;
}

/** Koch / Whole Sign / Placidus choice for the profile chart (REQ-001, DEC-009). Styled like the tab pills. */
export function HouseSystemSelector({ value, onChange }: HouseSystemSelectorProps) {
  const { t } = useTranslation();
  const labelId = "house-system-label";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <HelpBubble helpKey="chart.houseSystem">
        <Label id={labelId}>{t("natalChart.houseSystem.label")}</Label>
      </HelpBubble>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-1.5">
        {HOUSE_SYSTEMS.map((system) => {
          const name = houseSystemName(t, system);
          const selected = system === value;
          return (
            <HelpBubble key={system} helpKey={houseSystemHelpKey(system)} actionable label={name}>
              <button
                type="button"
                aria-pressed={selected}
                data-house-system={system}
                onClick={() => onChange(system)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[13px] transition-colors",
                  selected
                    ? "border-primary bg-primary/15 text-[#8fb6ff]"
                    : "border-border/50 text-muted-foreground hover:border-primary/60 hover:text-foreground",
                )}
              >
                {name}
              </button>
            </HelpBubble>
          );
        })}
      </div>
    </div>
  );
}
