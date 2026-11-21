import type { TFunction } from "i18next";
import type { HouseSystem } from "@astroweb/chart-core";

/** Localized name of a point or angle id (`natalChart.points.*`). */
export function pointLabel(t: TFunction, id: string): string {
  return t(`natalChart.points.${id}`, id);
}

/** Localized name of a house system (`houseAreas.houseSystemNames.*`). */
export function houseSystemName(t: TFunction, system: HouseSystem): string {
  return t(`houseAreas.houseSystemNames.${system === "whole-sign" ? "wholeSign" : system}`);
}
