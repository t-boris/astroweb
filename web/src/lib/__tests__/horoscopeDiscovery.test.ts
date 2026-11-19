import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const loadLocale = (lng: "en" | "ru") =>
  JSON.parse(readFileSync(resolve(__dirname, `../../../public/locales/${lng}/translation.json`), "utf-8"));

function keysDeep(obj: unknown, prefix = ""): string[] {
  if (!obj || typeof obj !== "object") return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    keysDeep(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe("Russian plain-language horoscope & forecast terminology (REQ-001, REQ-002, REQ-003, REQ-004)", () => {
  const ru = loadLocale("ru");
  const en = loadLocale("en");

  it("REQ-001: uses plain-language Russian name with «прогноз» or «гороскоп» for situation service and drops «Оракул»", () => {
    const situationLabels = [
      ru.nav.oracle,
      ru.tabs.oracle,
      ru.ai.oracleTitle,
      ru.ai.askOracle,
      ru.ai.answerTitle,
      ru.ai.oracleHistoryTitle,
      ru.help.tabs.oracle,
      ru.help.oracle.title,
      ru.help.oracle.cost,
      ru.help.oracle.balance,
      ru.help.oracle.question,
      ru.help.oracle.ask,
      ru.help.oracle.answer,
      ru.help.oracle.history,
      ru.a11y.oracleQuestion,
    ];

    for (const label of situationLabels) {
      expect(label).toMatch(/прогноз|гороскоп/i);
      expect(label).not.toMatch(/оракул/i);
    }

    // Description explains situation question + 3-month development forecast
    expect(ru.ai.oracleDescription).toMatch(/ситуац/i);
    expect(ru.ai.oracleDescription).toMatch(/3 месяца/);
    expect(ru.ai.oracleDescription).toMatch(/прогноз/i);
  });

  it("REQ-002: uses «Прогноз на отношения» consistently in Russian entry point, heading, actions, and help", () => {
    expect(ru.nav.compatibility).toBe("Прогноз на отношения");
    expect(ru.tabs.compatibility).toBe("Прогноз на отношения");
    expect(ru.ai.relationshipTitle).toBe("Прогноз на отношения");
    expect(ru.ai.relationshipAnswerTitle).toBe("Прогноз на отношения");
    expect(ru.ai.relationshipGenerate).toMatch(/прогноз на отношения/i);
    expect(ru.help.tabs.compatibility).toMatch(/прогноз на отношения/i);
    expect(ru.help.compatibility.title).toMatch(/прогноз на отношения/i);
    expect(ru.help.compatibility.generate).toMatch(/прогноз на отношения/i);

    for (const text of [
      ru.nav.compatibility,
      ru.tabs.compatibility,
      ru.ai.relationshipTitle,
      ru.ai.relationshipDescription,
      ru.ai.relationshipGenerate,
      ru.help.tabs.compatibility,
      ru.help.compatibility.title,
      ru.help.compatibility.generate,
    ]) {
      expect(text).not.toMatch(/совместим/i);
    }

    // Description explains partner details + both natal charts + 3 months
    expect(ru.ai.relationshipDescription).toMatch(/партнёр/i);
    expect(ru.ai.relationshipDescription).toMatch(/натальные карты/i);
    expect(ru.ai.relationshipDescription).toMatch(/3 месяца/);
  });

  it("REQ-003: uses Russian period labels «Гороскоп на день», «Гороскоп на месяц», «Гороскоп на год» and marks today free", () => {
    expect(ru.tabs.transits).toBe("Гороскопы");
    expect(ru.nav.transits).toBe("Гороскопы");
    expect(ru.horoscopes.dayTitle).toBe("Гороскоп на день");
    expect(ru.horoscopes.monthTitle).toBe("Гороскоп на месяц");
    expect(ru.horoscopes.yearTitle).toBe("Гороскоп на год");
    expect(ru.horoscopes.freeBadge).toBe("Бесплатно");
    expect(ru.tabs.transits).not.toMatch(/транзит/i);
  });

  it("REQ-004: daily subscription copy identifies profile, content, delivery, distinction from free today, and plain annual label", () => {
    expect(ru.tabs.astrologer).toContain("Ежедневный гороскоп");
    expect(ru.hub.coveredProfile).toContain("{{name}}");
    expect(ru.hub.includedContent).toBeTruthy();
    expect(ru.hub.includedDelivery).toMatch(/email/i);
    expect(ru.hub.distinctionFromFree).toMatch(/Гороскопа на день/i);
    expect(ru.hub.annualPlain).not.toMatch(/бесплатно|месяц/i);

    expect(en.hub.coveredProfile).toContain("{{name}}");
    expect(en.hub.includedContent).toBeTruthy();
    expect(en.hub.includedDelivery).toMatch(/email/i);
    expect(en.hub.distinctionFromFree).toMatch(/Today's Horoscope/i);
    expect(en.hub.annualPlain).not.toMatch(/free|month/i);
  });

  it("maintains exact EN/RU key parity for horoscopes and directCheckout namespaces", () => {
    expect(keysDeep(en.horoscopes).sort()).toEqual(keysDeep(ru.horoscopes).sort());
    expect(keysDeep(en.directCheckout).sort()).toEqual(keysDeep(ru.directCheckout).sort());
  });
});
