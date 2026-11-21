import { useTranslation } from "react-i18next";
import type { ChartResult } from "@/types";
import { isTimeEstimated } from "@/components/chart/utils/positions";
import { formatCoordinates, formatUtcTime } from "@/components/chart/utils/viewModel";

interface ChartContextLineProps {
  chart: ChartResult;
  /** Birth date as entered, YYYY-MM-DD (local to the birth timezone). */
  birthDate: string;
  /** Birth time as entered, HH:mm; ignored when the chart is estimated for local noon. */
  birthTime: string | null;
  /** Name of the place the chart is calculated for: the birth place, or the relocation place. */
  placeName: string;
  /** True when the chart is drawn for a place other than the birth place. */
  relocated: boolean;
}

/**
 * The date, time and place a chart was calculated for (REQ-001): local date and time, timezone, the UTC
 * instant, the place and its coordinates. For an unknown birth time it says that local noon was used and
 * that the angles, cusps and house assignments are not calculated.
 */
export function ChartContextLine({ chart, birthDate, birthTime, placeName, relocated }: ChartContextLineProps) {
  const { t } = useTranslation();
  const context = chart.context;
  const estimated = isTimeEstimated(chart);
  const timezone = context?.timezone ?? chart.meta.timezoneUsed;
  const utc = context ? formatUtcTime(context.utc) : "";
  const zone = utc ? t("natalChart.context.zoneWithUtc", { timezone, utc }) : timezone;
  const time = estimated
    ? t("natalChart.context.noonEstimated", { zone })
    : t("natalChart.context.localTime", { time: birthTime ?? chart.meta.timeUsed ?? "", zone });
  const place = relocated && placeName ? t("natalChart.context.relocatedPlace", { place: placeName }) : placeName;

  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      <p className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <span className="font-medium text-foreground">{t("natalChart.context.label")}</span>
        <span>📅 {birthDate}</span>
        <span>🕐 {time}</span>
        {place && <span>📍 {place}</span>}
        {context && <span>🌐 {formatCoordinates(context.lat, context.lng)}</span>}
      </p>
      {estimated && (
        <p className="rounded-md border border-[#e8c969]/40 bg-[#e8c969]/10 p-3 text-[#f2dd9a]">
          {t("natalChart.context.estimatedNote")}
        </p>
      )}
    </div>
  );
}
