/**
 * Disc colours and the strength of the dividing lines of the wheel. The profile page keeps its quiet look; the
 * downloaded image uses a lighter disc and stronger lines, because on a shared picture the thin 14 to 30 percent
 * white lines of the page vanish into the background.
 */
export interface WheelLook {
  /** Centre and edge of the radial gradient behind the wheel. */
  discCenter: string;
  discEdge: string;
  /** Lines between the twelve signs (sector outline in the element colour). */
  sectorStrokeOpacity: number;
  sectorStrokeWidth: number;
  /** Circle around the sign band. */
  outerRingStroke: string;
  outerRingWidth: number;
  /** The house number ring: its fill, its outline, and the cusp lines that divide the houses. */
  houseRingFill: string;
  houseRingStroke: string;
  cuspStroke: string;
  cuspWidth: number;
  /** Circle that the aspect lines end on. */
  innerCircleStroke: string;
}

export const PAGE_WHEEL_LOOK: WheelLook = {
  discCenter: "#0f0f2e",
  discEdge: "#070714",
  sectorStrokeOpacity: 0.3,
  sectorStrokeWidth: 1,
  outerRingStroke: "rgba(255,255,255,0.15)",
  outerRingWidth: 1.5,
  houseRingFill: "rgba(255,255,255,0.03)",
  houseRingStroke: "rgba(255,255,255,0.14)",
  cuspStroke: "rgba(255, 255, 255, 0.22)",
  cuspWidth: 1,
  innerCircleStroke: "rgba(255,255,255,0.3)",
};

export const IMAGE_WHEEL_LOOK: WheelLook = {
  discCenter: "#323d72",
  discEdge: "#252e5e",
  sectorStrokeOpacity: 0.85,
  sectorStrokeWidth: 1.5,
  outerRingStroke: "rgba(255,255,255,0.55)",
  outerRingWidth: 2,
  houseRingFill: "rgba(255,255,255,0.05)",
  houseRingStroke: "rgba(255,255,255,0.4)",
  cuspStroke: "rgba(255, 255, 255, 0.6)",
  cuspWidth: 1.5,
  innerCircleStroke: "rgba(255,255,255,0.65)",
};
