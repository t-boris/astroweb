import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ChartResult } from "@/types";
import {
  SIGN_ELEMENTS,
  ZODIAC_GLYPHS,
  formatDegreeMinute,
  getAnalysisPoints,
  layoutDegreeStrip,
  pointGlyph,
} from "@astroweb/chart-core";
import { ELEMENT_COLORS } from "@/components/chart/utils/elementColors";
import { pointLabel } from "@/components/chart/utils/labels";
import { signLabel } from "@/lib/signs";

/** Markers closer than this share of the scale (about 3 degrees) go to different rows so no label is hidden. */
const GAP_PERCENT = 9;
const LANE_HEIGHT = 56;
const AXIS_HEIGHT = 30;
const SCALE_TICKS = Array.from({ length: 31 }, (_, degree) => degree);
const LABELLED_TICKS = SCALE_TICKS.filter((degree) => degree % 5 === 0);

/**
 * 0-30 degree strip (REQ-004): each point of getAnalysisPoints at its degree within its sign on one
 * common scale, with its sign glyph. The scale is the same for every sign, so the strip shows which
 * points sit at similar degrees, whatever their sign.
 */
export function DegreeStrip({ chart }: { chart: ChartResult }) {
  const { t } = useTranslation();
  const markers = useMemo(() => layoutDegreeStrip(getAnalysisPoints(chart), GAP_PERCENT), [chart]);
  const laneCount = markers.reduce((max, marker) => Math.max(max, marker.lane + 1), 1);
  const height = AXIS_HEIGHT + laneCount * LANE_HEIGHT;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-serif text-lg text-[#8fb6ff]">{t("natalChart.summary.stripTitle")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t("natalChart.summary.stripDescription")}</p>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[680px] px-6">
          <div className="relative" style={{ height }}>
            {/* Scale, ticks and the stem that leads each marker to its exact degree. Decorative. */}
            <div aria-hidden="true" className="absolute inset-0">
              <span
                className="absolute left-0 right-0 border-t"
                style={{ bottom: AXIS_HEIGHT, borderColor: "var(--accent-mist)" }}
              />
              {SCALE_TICKS.map((degree) => (
                <span
                  key={`tick-${degree}`}
                  className="absolute"
                  style={{
                    left: `${(degree / 30) * 100}%`,
                    bottom: AXIS_HEIGHT - (degree % 5 === 0 ? 6 : 3),
                    height: degree % 5 === 0 ? 6 : 3,
                    borderLeft: "1px solid var(--accent-mist)",
                  }}
                />
              ))}
              {LABELLED_TICKS.map((degree) => (
                <span
                  key={`label-${degree}`}
                  className="absolute -translate-x-1/2 text-[11px] tabular-nums text-muted-foreground"
                  style={{ left: `${(degree / 30) * 100}%`, bottom: 2 }}
                >
                  {degree}°
                </span>
              ))}
              {markers.map(({ point, x, lane }) => (
                <span
                  key={`stem-${point.id}`}
                  className="absolute w-px"
                  style={{
                    left: `${x}%`,
                    bottom: AXIS_HEIGHT - 6,
                    height: lane * LANE_HEIGHT + 6,
                    background: "var(--line)",
                  }}
                />
              ))}
            </div>
            <ol className="absolute inset-0 m-0 list-none p-0" aria-label={t("natalChart.summary.stripTitle")}>
              {markers.map(({ point, x, lane }) => {
                const color = ELEMENT_COLORS[SIGN_ELEMENTS[point.sign]].text;
                const label = t("natalChart.summary.pointLabel", {
                  name: pointLabel(t, point.id),
                  sign: signLabel(t, point.sign),
                  position: formatDegreeMinute(point.lon),
                });
                return (
                  <li
                    key={point.id}
                    className="absolute m-0 -translate-x-1/2 p-0"
                    style={{ left: `${x}%`, bottom: AXIS_HEIGHT + lane * LANE_HEIGHT }}
                    aria-label={label}
                    title={label}
                    data-point={point.id}
                    data-x={x.toFixed(2)}
                    data-lane={lane}
                  >
                    <span className="flex flex-col items-center leading-none" aria-hidden="true">
                      <span className="text-[11px] tabular-nums text-muted-foreground">{point.degree}°</span>
                      <span
                        className="my-1 font-serif text-lg"
                        style={{ color, fontSize: pointGlyph(point.id).length > 1 ? 12 : undefined }}
                      >
                        {pointGlyph(point.id)}
                      </span>
                      <span className="text-xs" style={{ color }}>
                        {ZODIAC_GLYPHS[point.sign]}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
