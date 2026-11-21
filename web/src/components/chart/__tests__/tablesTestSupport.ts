import { readFileSync } from "node:fs";
import { join } from "node:path";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { loadFixtures, type FixtureName } from "@astroweb/chart-core/test-fixtures";

/**
 * Shared setup of the table, matrix, summary and profile tests: the real EN and RU translation files
 * (so a missing key shows up as a raw key in the markup) and the real chart fixtures.
 */
const WEB = join(__dirname, "..", "..", "..", "..");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

export type { FixtureName };

export const charts = loadFixtures().charts;

export async function initI18n(lng: "en" | "ru"): Promise<void> {
  const resources = {
    en: { translation: readJson<object>(join(WEB, "public", "locales", "en", "translation.json")) },
    ru: { translation: readJson<object>(join(WEB, "public", "locales", "ru", "translation.json")) },
  };
  if (!i18next.isInitialized) {
    await i18next.use(initReactI18next).init({
      lng,
      fallbackLng: "en",
      interpolation: { escapeValue: false },
      resources,
    });
  } else {
    await i18next.changeLanguage(lng);
  }
}

/** A translation key that was not found renders as the key itself; none of these namespaces may leak into the markup. */
export const RAW_KEY = /\b(natalChart|houseAreas|tables|chart\.aspects|help)\.[A-Za-z-]+/;

/** Visible text of a piece of markup: tags removed, entities of the characters used here decoded, spaces collapsed. */
export function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Attributes of a start tag as { name: value }. */
export function attrsOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w-]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

/** Attributes of every start tag of the given element that carries the given attribute. */
export function tagsWith(html: string, element: string, attribute: string): Record<string, string>[] {
  const pattern = new RegExp(`<${element}\\b[^>]*\\b${attribute}="[^"]*"[^>]*>`, "g");
  return [...html.matchAll(pattern)].map((m) => attrsOf(m[0]));
}

/** The cells of every `<tr data-point>` row as text, keyed by the point id. */
export function positionRows(html: string): Record<string, string[]> {
  const rows: Record<string, string[]> = {};
  for (const m of html.matchAll(/<tr data-point="(\w+)">([\s\S]*?)<\/tr>/g)) {
    rows[m[1]] = [...m[2].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => textOf(cell[1]));
  }
  return rows;
}
