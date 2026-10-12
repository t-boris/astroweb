/** Languages the UI and the AI backend support. */
export type AppLanguage = "en" | "ru";

export const APP_LANGUAGES: readonly AppLanguage[] = ["en", "ru"];

const DATE_LOCALES: Record<AppLanguage, string> = {
  en: "en-US",
  ru: "ru-RU",
};

/** Map an i18next language (e.g. "ru-RU") to a supported app language. */
export function toAppLanguage(lng: string | undefined): AppLanguage {
  const base = lng?.split("-")[0];
  return APP_LANGUAGES.find((l) => l === base) ?? "en";
}

export function dateLocale(language: AppLanguage): string {
  return DATE_LOCALES[language];
}
