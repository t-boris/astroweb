import {
  aspectSegments,
  filterAspects,
  getAngles,
  getPositions,
  getSharedAspects,
  isTimeEstimated,
  placePoints,
  wheelRotation,
  type AspectSegment,
  type PlacedPoint,
} from "@astroweb/chart-core";
import type { ChartAngles, ChartResult, SharedAspect } from "@/types";

/** Everything the wheel layers draw, derived from the chart and the active aspect filters. */
export interface WheelModel {
  /** True when the birth time is unknown: no houses and no angles are drawn (REQ-001). */
  estimated: boolean;
  /** Longitude on the 9 o'clock axis. */
  rotation: number;
  angles: ChartAngles | null;
  cusps: number[] | null;
  placed: PlacedPoint[];
  /** The shared aspect set after the filters. */
  visibleAspects: SharedAspect[];
  segments: AspectSegment[];
}

/**
 * The one place the wheel is derived from a chart. The profile page and the image export both draw
 * from this model, so the downloaded image is the wheel on screen (REQ-001, DEC-011).
 */
export function buildWheelModel(chart: ChartResult, activeFilters: ReadonlySet<string>): WheelModel {
  // Without a birth time the positions are local-noon estimates: no houses, no angles.
  const estimated = isTimeEstimated(chart);
  const rotation = wheelRotation(chart);
  const angles = estimated ? null : getAngles(chart);
  const cusps = estimated || chart.houses.cusps.length !== 12 ? null : chart.houses.cusps;
  const placed = placePoints(getPositions(chart));
  // One shared aspect set; the filters only decide which of its aspects are drawn.
  const visibleAspects = filterAspects(getSharedAspects(chart), activeFilters);
  const segments = aspectSegments(chart, visibleAspects, rotation);
  return { estimated, rotation, angles, cusps, placed, visibleAspects, segments };
}
