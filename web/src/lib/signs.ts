import type { TFunction } from "i18next";

/**
 * Localize an English zodiac sign name (e.g. "Aries") via the `signs` i18n
 * namespace. Falls back to the English name, or an em-dash when undefined.
 */
export function signLabel(t: TFunction, sign?: string | null): string {
  if (!sign) return "—";
  return t(`signs.${sign}`, sign);
}
