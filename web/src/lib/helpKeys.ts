import {
  ASPECT_GLYPHS,
  PLANET_GLYPHS,
  SIGN_ELEMENTS,
  ZODIAC_SIGNS,
} from "@/components/chart/utils/constants";

/**
 * Keys of the generic astrology help texts (`help.*` in the translation files).
 * Components never build these keys by hand: they call the builders below, so the
 * content test can enumerate every key a screen can ask for and prove it has an
 * EN and a RU text.
 */

/** Bodies that carry a text of their own (Sun ... Pluto). */
export const HELP_PLANETS: readonly string[] = Object.keys(PLANET_GLYPHS);
export const HELP_SIGNS: readonly string[] = ZODIAC_SIGNS;
export const HELP_ASPECTS: readonly string[] = Object.keys(ASPECT_GLYPHS);
export const HELP_HOUSES: readonly number[] = Array.from({ length: 12 }, (_, i) => i + 1);
export const HELP_HOUSE_SYSTEMS: readonly string[] = ["placidus", "koch", "whole-sign"];
export const HELP_ELEMENTS: readonly string[] = Array.from(new Set(Object.values(SIGN_ELEMENTS)));
/** Profile tabs; "premium" has no tab label (DEC-010), its text sits on the store heading. */
export const HELP_TABS: readonly string[] = [
  "chart", "planets", "aspects", "houses", "interpretation", "oracle", "transits", "compatibility", "astrologer", "premium",
];

/** "ASC" and "MC" appear as aspect endpoints next to the planets; they share the Rising and Midheaven texts. */
export function planetHelpKey(body: string): string {
  if (body === "ASC") return "terms.ascendant";
  if (body === "MC") return "terms.midheaven";
  return `planets.${body}`;
}

export function signHelpKey(sign: string): string {
  return `signs.${sign}`;
}

export function aspectHelpKey(type: string): string {
  return `aspects.${type}`;
}

export function houseHelpKey(house: number): string {
  return `houses.${house}`;
}

export function houseSystemHelpKey(system: string): string {
  return `houseSystems.${system === "whole-sign" ? "wholeSign" : system}`;
}

export function elementHelpKey(element: string): string {
  return `elements.${element}`;
}

export function tabHelpKey(tab: string): string {
  return `tabs.${tab}`;
}

/** Every key the builders can produce for the domains above. */
export function builderHelpKeys(): string[] {
  return [
    ...HELP_PLANETS.map(planetHelpKey),
    planetHelpKey("ASC"),
    planetHelpKey("MC"),
    ...HELP_SIGNS.map(signHelpKey),
    ...HELP_ASPECTS.map(aspectHelpKey),
    ...HELP_HOUSES.map(houseHelpKey),
    ...HELP_HOUSE_SYSTEMS.map(houseSystemHelpKey),
    ...HELP_ELEMENTS.map(elementHelpKey),
    ...HELP_TABS.map(tabHelpKey),
  ];
}
