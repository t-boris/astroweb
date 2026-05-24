import { request } from "node:https";
import type { ChartResult, Profile } from "../types";
import { detectAspect } from "../astro/aspects";

export type SupportedLanguage = "ru" | "en";

interface AnthropicContentBlock {
  type?: string;
  text?: string;
}

interface AnthropicErrorResponse {
  type?: string;
  message?: string;
}

interface AnthropicMessageResponse {
  model?: string;
  stop_reason?: string | null;
  content?: AnthropicContentBlock[];
  error?: AnthropicErrorResponse;
}

interface AiGenerateInput {
  systemInstruction: string;
  userPrompt: string;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

interface ClaudeCallResult {
  text: string;
  stopReason: string | null;
  model: string;
}

interface AiGenerateOptions {
  allowContinuation?: boolean;
  sanitizeOutput?: boolean;
  // If set, keep requesting continuation until this tag appears (or attempts exhausted).
  // Useful when stop_reason is not max_tokens but the model still stops early.
  requireEndTag?: string;
}

interface AiTextResult {
  text: string;
  model: string;
}

export const PREMIUM_PDF_MODEL = "claude-sonnet-4-6";
const DEFAULT_MODEL = PREMIUM_PDF_MODEL;
const ANTHROPIC_VERSION = "2023-06-01";
const REQUEST_TIMEOUT_MS = 180_000;
const ANTHROPIC_API_KEY_PATTERN = /sk-ant-[A-Za-z0-9_-]+/;

const BODY_LABELS: Record<string, Record<SupportedLanguage, string>> = {
  Sun: { en: "Sun", ru: "Солнце" },
  Moon: { en: "Moon", ru: "Луна" },
  Mercury: { en: "Mercury", ru: "Меркурий" },
  Venus: { en: "Venus", ru: "Венера" },
  Mars: { en: "Mars", ru: "Марс" },
  Jupiter: { en: "Jupiter", ru: "Юпитер" },
  Saturn: { en: "Saturn", ru: "Сатурн" },
  Uranus: { en: "Uranus", ru: "Уран" },
  Neptune: { en: "Neptune", ru: "Нептун" },
  Pluto: { en: "Pluto", ru: "Плутон" },
  ASC: { en: "Ascendant", ru: "Асцендент" },
  MC: { en: "Midheaven", ru: "Середина неба" },
};

const SIGN_LABELS: Record<string, Record<SupportedLanguage, string>> = {
  Aries: { en: "Aries", ru: "Овен" },
  Taurus: { en: "Taurus", ru: "Телец" },
  Gemini: { en: "Gemini", ru: "Близнецы" },
  Cancer: { en: "Cancer", ru: "Рак" },
  Leo: { en: "Leo", ru: "Лев" },
  Virgo: { en: "Virgo", ru: "Дева" },
  Libra: { en: "Libra", ru: "Весы" },
  Scorpio: { en: "Scorpio", ru: "Скорпион" },
  Sagittarius: { en: "Sagittarius", ru: "Стрелец" },
  Capricorn: { en: "Capricorn", ru: "Козерог" },
  Aquarius: { en: "Aquarius", ru: "Водолей" },
  Pisces: { en: "Pisces", ru: "Рыбы" },
};

const ASPECT_LABELS: Record<string, Record<SupportedLanguage, string>> = {
  conjunction: { en: "conjunction", ru: "соединение" },
  sextile: { en: "sextile", ru: "секстиль" },
  square: { en: "square", ru: "квадратура" },
  trine: { en: "trine", ru: "тригон" },
  opposition: { en: "opposition", ru: "оппозиция" },
};

const HOUSE_TOPICS: Record<number, Record<SupportedLanguage, string>> = {
  1: { en: "identity, body, manner of acting", ru: "личность, тело, способ действовать" },
  2: { en: "resources, money, self-worth", ru: "ресурсы, деньги, самоценность" },
  3: { en: "learning, siblings, communication", ru: "обучение, близкое окружение, коммуникация" },
  4: { en: "home, family roots, inner foundation", ru: "дом, родовые корни, внутренняя опора" },
  5: { en: "creativity, romance, children, play", ru: "творчество, романтика, дети, игра" },
  6: { en: "work rhythm, health, craft, service", ru: "рабочий ритм, здоровье, мастерство, служение" },
  7: { en: "partnership, marriage, open mirrors", ru: "партнерство, брак, открытые зеркала" },
  8: { en: "shared resources, intimacy, crisis, trust", ru: "общие ресурсы, близость, кризис, доверие" },
  9: { en: "beliefs, travel, higher study, meaning", ru: "убеждения, путешествия, высшее знание, смысл" },
  10: { en: "career, status, vocation, public role", ru: "карьера, статус, призвание, публичная роль" },
  11: { en: "friends, networks, hopes, community", ru: "друзья, сети, надежды, сообщество" },
  12: { en: "subconscious, solitude, endings, spirit", ru: "подсознание, уединение, завершения, дух" },
};

export interface PremiumPdfNarrative {
  planets?: string;
  houses?: string;
  aspects?: string;
  portrait?: string;
}

export type PremiumPdfNarrativeSection = keyof PremiumPdfNarrative;

function toLanguage(language: unknown): SupportedLanguage {
  return language === "ru" ? "ru" : "en";
}

function formatDegree(value: number): string {
  return `${value.toFixed(2)} deg`;
}

function normalizeAnthropicApiKey(rawApiKey: string | undefined): string {
  const trimmed = rawApiKey?.trim() ?? "";
  const match = trimmed.match(ANTHROPIC_API_KEY_PATTERN);
  return match?.[0] ?? trimmed;
}

export function normalizeLanguage(language: unknown): SupportedLanguage {
  return toLanguage(language);
}

export function buildPlanetaryContext(chart: ChartResult): string {
  const knownBodies = new Set(chart.points.map((point) => point.body));

  const points = chart.points
    .map((point) => {
      const houseLabel = point.house === null ? "house: unknown" : `house: ${point.house}`;
      return `${point.body}: ${point.sign} ${formatDegree(point.degreeInSign)} (${houseLabel})`;
    })
    .join("\n");

  const aspects = chart.aspects
    .filter((aspect) => knownBodies.has(aspect.a) && knownBodies.has(aspect.b))
    .sort((a, b) => b.exactness - a.exactness)
    .slice(0, 12)
    .map(
      (aspect) =>
        `${aspect.a} ${aspect.type} ${aspect.b} (orb ${aspect.orb.toFixed(2)} deg, exactness ${aspect.exactness.toFixed(2)})`,
    )
    .join("\n");

  return [
    `Time known: ${chart.meta.timeUsed === null ? "no" : "yes"}`,
    `Zodiac: ${chart.meta.zodiac}`,
    "Planet positions:",
    points,
    "Major planetary aspects:",
    aspects || "none",
  ].join("\n");
}

function labelFor(
  labels: Record<string, Record<SupportedLanguage, string>>,
  key: string,
  language: SupportedLanguage,
): string {
  return labels[key]?.[language] ?? key;
}

function formatLocalizedDegree(value: number): string {
  return `${value.toFixed(2)}°`;
}

function formatLocalizedLongitude(longitude: number, language: SupportedLanguage): string {
  const normalized = ((longitude % 360) + 360) % 360;
  const signIndex = Math.floor(normalized / 30);
  const sign = [
    "Aries",
    "Taurus",
    "Gemini",
    "Cancer",
    "Leo",
    "Virgo",
    "Libra",
    "Scorpio",
    "Sagittarius",
    "Capricorn",
    "Aquarius",
    "Pisces",
  ][signIndex];
  const degree = normalized - signIndex * 30;
  return `${formatLocalizedDegree(degree)} ${labelFor(SIGN_LABELS, sign, language)}`;
}

function clipForPrompt(value: string, maxLength: number): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1).trim()}…`;
}

function buildPremiumPdfChartContext(params: {
  profile: Profile;
  chart: ChartResult;
  language: SupportedLanguage;
  isRelocated?: boolean;
}): string {
  const { profile, chart, language, isRelocated } = params;
  const timeText =
    profile.timeUnknown || !profile.birthTime
      ? language === "ru"
        ? "время рождения неизвестно"
        : "birth time unknown"
      : profile.birthTime;

  const points = chart.points
    .map((point) => {
      const body = labelFor(BODY_LABELS, point.body, language);
      const sign = labelFor(SIGN_LABELS, point.sign, language);
      const house =
        point.house === null
          ? language === "ru"
            ? "дом неизвестен"
            : "house unknown"
          : language === "ru"
            ? `${point.house} дом (${HOUSE_TOPICS[point.house]?.[language]})`
            : `house ${point.house} (${HOUSE_TOPICS[point.house]?.[language]})`;
      return `${body}: ${formatLocalizedDegree(point.degreeInSign)} ${sign}, ${house}`;
    })
    .join("\n");

  const houses =
    chart.houses.asc === null
      ? language === "ru"
        ? "Дома, Асцендент и Середина неба ненадежны, потому что время рождения неизвестно."
        : "Houses, Ascendant and Midheaven are unreliable because birth time is unknown."
      : chart.houses.cusps
          .map((cusp, index) => {
            const house = index + 1;
            const planets = chart.points
              .filter((point) => point.house === house)
              .map((point) => labelFor(BODY_LABELS, point.body, language))
              .join(", ");
            const planetText =
              planets ||
              (language === "ru" ? "планет в доме нет" : "no planets in this house");
            return `${house}: ${formatLocalizedLongitude(cusp, language)}; ${HOUSE_TOPICS[house]?.[language]}; ${planetText}`;
          })
          .join("\n");

  const aspects = chart.aspects
    .slice()
    .sort((a, b) => b.exactness - a.exactness)
    .map((aspect) => {
      const a = labelFor(BODY_LABELS, aspect.a, language);
      const b = labelFor(BODY_LABELS, aspect.b, language);
      const type = labelFor(ASPECT_LABELS, aspect.type, language);
      return `${a} ${type} ${b}; orb ${aspect.orb.toFixed(2)}°; exactness ${Math.round(aspect.exactness * 100)}%`;
    })
    .join("\n");

  const angles = [
    chart.houses.asc === null
      ? null
      : `ASC: ${formatLocalizedLongitude(chart.houses.asc, language)}`,
    chart.houses.mc === null
      ? null
      : `MC: ${formatLocalizedLongitude(chart.houses.mc, language)}`,
  ].filter(Boolean);

  return [
    language === "ru" ? "Данные человека:" : "Person data:",
    `Name: ${profile.name}`,
    `Birth date: ${profile.birthDate}`,
    `Birth time: ${timeText}`,
    `Birth place: ${profile.birthPlace}`,
    `Timezone: ${profile.timezone}`,
    `Chart mode: ${isRelocated ? "relocated" : "natal"}`,
    `House system: ${chart.meta.houseSystem}`,
    `Zodiac: ${chart.meta.zodiac}`,
    angles.length ? `Angles:\n${angles.join("\n")}` : "",
    language === "ru" ? "Положения планет:" : "Planet positions:",
    points,
    language === "ru" ? "Дома:" : "Houses:",
    houses,
    language === "ru" ? "Мажорные аспекты:" : "Major aspects:",
    aspects || (language === "ru" ? "нет мажорных аспектов" : "no major aspects"),
  ].filter(Boolean).join("\n");
}

function buildBaseSectionsContext(sections: ReadonlyArray<{
  title: string;
  body: string;
  category?: string;
  detail?: string;
}>): string {
  if (sections.length === 0) return "none";

  return sections
    .slice(0, 12)
    .map((section, index) => {
      const label = section.category ? `${section.title} (${section.category})` : section.title;
      const detail = section.detail ? ` Detail: ${clipForPrompt(section.detail, 350)}` : "";
      return `${index + 1}. ${label}.${detail}\n${clipForPrompt(section.body, 900)}`;
    })
    .join("\n\n");
}

export function buildPremiumPdfNarrativePrompt(params: {
  profile: Profile;
  chart: ChartResult;
  language: SupportedLanguage;
  sections: ReadonlyArray<{
    title: string;
    body: string;
    category?: string;
    detail?: string;
  }>;
  isRelocated?: boolean;
}): AiGenerateInput {
  const { profile, chart, language, sections, isRelocated } = params;
  const chartContext = buildPremiumPdfChartContext({
    profile,
    chart,
    language,
    isRelocated,
  });
  const baseSectionsContext = buildBaseSectionsContext(sections);

  const systemInstruction =
    language === "ru"
      ? [
          "Ты автор премиальной астрологической брошюры и строгий редактор русского языка.",
          "Пиши живой связный текст для взрослого читателя: глубоко, конкретно, без канцелярита и без справочного перечисления.",
          "Используй только предоставленные данные натальной карты. Не придумывай события, диагнозы, транзиты, медицинские, юридические или финансовые советы.",
          "Каждый астрологический термин сразу объясняй человеческим языком, но не превращай текст в учебник.",
        ].join(" ")
      : [
          "You are the author of a premium astrology booklet and a strict English editor.",
          "Write a cohesive, elegant reading for an adult reader: deep, specific, and interpretive rather than encyclopedic.",
          "Use only the provided natal chart data. Do not invent events, diagnoses, transits, or medical, legal, or financial advice.",
          "Explain each astrological term in plain language without turning the text into a textbook.",
        ].join(" ");

  const userPrompt =
    language === "ru"
      ? [
          `Напиши премиальный текст PDF для ${profile.name}.`,
          "Нужно получить цельную брошюру минимум на 6 страниц PDF. Текст должен быть длинным, связным и разделенным на секции и подсекции. Между секциями обязательно должны быть логические переходы.",
          "Запрещено писать фразы вроде «это рассказ», «интерпретация как рассказ», «в этой истории» или объяснять, что текст написан как рассказ.",
          "Не пиши сухие фразы вроде «Солнце показывает личность, жизненная сила...» или «положение описывает, через какой темперамент...». Вместо этого объясняй конкретно: что означает именно это Солнце, именно в этом знаке, именно в этом доме, и как оно проявляется в характере, выборе, привычках, отношениях и внутренней мотивации.",
          "Данные карты:",
          chartContext,
          "Тексты из интерфейса можно использовать только как дополнительный контекст, если они помогают. Не копируй сухие формулировки:",
          baseSectionsContext,
          "Структура ответа строго по маркерам ниже. Маркеры должны быть отдельными строками, без Markdown вокруг них:",
          "[PLANETS]",
          "Здесь дай большую секцию о планетах как действующих силах психики. Разбери каждую планету из данных карты: Солнце, Луну, Меркурий, Венеру, Марс, Юпитер, Сатурн, Уран, Нептун и Плутон. Для каждой планеты обязательно объясни: что эта планета значит психологически; как знак меняет темперамент функции; через какой дом и сферу жизни она проявляется; как это может звучать в поведении человека. Не ограничивайся одним предложением. Пиши абзацами, а не таблицей.",
          "[HOUSES]",
          "Здесь дай секцию о домах. Если время рождения известно, раскрой все 12 домов: что значит сам дом, какой знак на куспиде задает тон, какие планеты находятся внутри и что это означает. Если в доме нет планет, объясни, что тема не исчезает, а работает через знак куспида и жизненные обстоятельства. Если время рождения неизвестно, прямо объясни ограничение.",
          "[ASPECTS]",
          "Здесь раскрой все мажорные аспекты из списка. Для каждого аспекта назови планеты, тип аспекта и орб, а затем объясни конкретную внутреннюю динамику: как функции спорят, поддерживают друг друга или дают возможность. Секстиль, квадратуру, тригон, оппозицию и соединение раскрывай полно, без пустых названий вроде «аспект возможностей».",
          "[PORTRAIT]",
          "Здесь собери психологический портрет человека в цельный синтез. Не перечисляй снова таблицу. Покажи характер, эмоциональный слой, коммуникацию, стиль близости, волю, ресурсы, напряжения, сильные стороны, уязвимости и зрелую задачу карты. Делай переходы от предыдущих секций, чтобы текст читался как единое объяснение человека.",
          "Формат:",
          "1) Только русский язык.",
          "2) Markdown-заголовки внутри секций разрешены: ## и ###.",
          "3) Без таблиц.",
          "4) Общий объем 3500-5200 слов.",
          "5) Заверши ответ отдельной строкой: [END_OF_REPORT]",
        ].join("\n\n")
      : [
          `Write the premium PDF text for ${profile.name}.`,
          "The result must feel like a polished booklet of at least 6 PDF pages. The text must be long, cohesive, divided into sections and subsections, with logical transitions between sections.",
          "Do not write phrases such as “this is a story”, “story interpretation”, or explain that the text is written as a story.",
          "Do not use dry phrases such as “The Sun shows identity...” or “the placement describes temperament...”. Instead, explain specifically what this Sun means in this sign and this house, and how it appears in character, choices, habits, relationships, and inner motivation.",
          "Chart data:",
          chartContext,
          "Existing interface text may be used only as additional context. Do not copy generic wording:",
          baseSectionsContext,
          "Use the exact markers below. Markers must be separate lines, with no Markdown around them:",
          "[PLANETS]",
          "Write a large section about planets as active psychological forces. Cover every planet in the chart data: Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune and Pluto. For each planet explain what it means psychologically, how the sign changes the temperament of that function, through which house and life area it works, and how it may appear in behavior. Do not reduce it to one sentence. Use paragraphs, not tables.",
          "[HOUSES]",
          "Write the section about houses. If birth time is known, cover all 12 houses: what the house means, how the cusp sign colors the area, which planets are inside and what that means. If a house has no planets, explain that the topic is not absent; it works through the cusp sign and life circumstances. If birth time is unknown, explain the limitation clearly.",
          "[ASPECTS]",
          "Interpret every major aspect from the list. For each aspect name the planets, aspect type and orb, then explain the concrete inner dynamic: how the functions clash, support, intensify, or create opportunity. Explain sextiles, squares, trines, oppositions and conjunctions fully; never leave an empty label like “aspect of opportunity”.",
          "[PORTRAIT]",
          "Synthesize the psychological portrait into one coherent reading. Do not repeat the table. Show character, emotional layer, communication style, intimacy style, will, resources, tensions, strengths, vulnerabilities and the mature task of the chart. Connect it logically to the previous sections.",
          "Format:",
          "1) English only.",
          "2) Markdown headings inside sections are allowed: ## and ###.",
          "3) No tables.",
          "4) Total length 3500-5200 words.",
          "5) End with a separate line: [END_OF_REPORT]",
        ].join("\n\n");

  return {
    systemInstruction,
    userPrompt,
    model: PREMIUM_PDF_MODEL,
    temperature: 0.55,
    maxOutputTokens: 8000,
  };
}

export function buildPremiumPdfNarrativeSectionPrompt(params: {
  profile: Profile;
  chart: ChartResult;
  language: SupportedLanguage;
  sections: ReadonlyArray<{
    title: string;
    body: string;
    category?: string;
    detail?: string;
  }>;
  section: PremiumPdfNarrativeSection;
  isRelocated?: boolean;
}): AiGenerateInput {
  const { profile, chart, language, sections, section, isRelocated } = params;
  const chartContext = buildPremiumPdfChartContext({
    profile,
    chart,
    language,
    isRelocated,
  });
  const baseSectionsContext = buildBaseSectionsContext(sections);
  const sectionInstructions: Record<PremiumPdfNarrativeSection, {
    ru: string;
    en: string;
    words: string;
  }> = {
    planets: {
      words: "900-1300",
      ru: "Напиши секцию о планетах как действующих силах психики. Разбери каждую планету из данных карты: Солнце, Луну, Меркурий, Венеру, Марс, Юпитер, Сатурн, Уран, Нептун и Плутон. Для каждой планеты объясни психологический смысл, знак, дом, конкретную сферу жизни и поведенческое проявление. Не ограничивайся справочным определением.",
      en: "Write the section about planets as active psychological forces. Cover every planet in the chart data: Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune and Pluto. For each planet explain the psychological meaning, sign, house, concrete life sphere and behavioral expression. Do not reduce it to a dictionary definition.",
    },
    houses: {
      words: "900-1300",
      ru: "Напиши секцию о домах. Если время рождения известно, раскрой все 12 домов: значение дома, знак на куспиде, планеты внутри и их смысл. Если планет в доме нет, объясни, что тема не исчезает, а работает через знак куспида и обстоятельства. Если время неизвестно, объясни ограничение.",
      en: "Write the section about houses. If birth time is known, cover all 12 houses: house meaning, cusp sign, planets inside and their meaning. If a house has no planets, explain that the topic is not absent; it works through the cusp sign and circumstances. If time is unknown, explain the limitation.",
    },
    aspects: {
      words: "800-1200",
      ru: "Напиши секцию обо всех мажорных аспектах из списка. Для каждого аспекта назови планеты, тип и орб, затем объясни внутреннюю динамику: конфликт, поддержку, усиление или возможность. Секстиль, квадратуру, тригон, оппозицию и соединение раскрывай полно, без пустых ярлыков.",
      en: "Write the section about every major aspect in the list. For each aspect name the planets, type and orb, then explain the inner dynamic: conflict, support, amplification or opportunity. Explain sextiles, squares, trines, oppositions and conjunctions fully, with no empty labels.",
    },
    portrait: {
      words: "900-1300",
      ru: "Напиши цельный психологический портрет. Не повторяй таблицу. Собери характер, эмоциональный слой, коммуникацию, стиль близости, волю, ресурсы, напряжения, сильные стороны, уязвимости и зрелую задачу карты в связный синтез.",
      en: "Write a cohesive psychological portrait. Do not repeat the table. Synthesize character, emotional layer, communication style, intimacy style, will, resources, tensions, strengths, vulnerabilities and the mature task of the chart.",
    },
  };
  const instruction = sectionInstructions[section];

  const systemInstruction =
    language === "ru"
      ? "Ты автор премиальной астрологической брошюры и строгий редактор русского языка. Пиши живой связный текст для взрослого читателя: глубоко, конкретно, без канцелярита и без справочного перечисления. Используй только предоставленные данные натальной карты. Не придумывай события, диагнозы, транзиты, медицинские, юридические или финансовые советы."
      : "You are the author of a premium astrology booklet and a strict English editor. Write a cohesive, elegant reading for an adult reader: deep, specific, and interpretive rather than encyclopedic. Use only the provided natal chart data. Do not invent events, diagnoses, transits, or medical, legal, or financial advice.";

  const userPrompt =
    language === "ru"
      ? [
          `Напиши только одну секцию premium PDF для ${profile.name}.`,
          instruction.ru,
          "Текст должен быть связанным, с логическими переходами, секциями и подсекциями. Не пиши фразы вроде «это рассказ», «интерпретация как рассказ», «в этой истории».",
          "Не пиши сухие фразы вроде «Солнце показывает личность, жизненная сила...» или «положение описывает, через какой темперамент...». Объясняй конкретно по данным карты: что означает положение, через какую сферу жизни оно проявляется и как это может звучать в поведении человека.",
          `Объем: ${instruction.words} слов.`,
          "Markdown-заголовки ## и ### разрешены. Таблицы запрещены.",
          "Данные карты:",
          chartContext,
          "Тексты из интерфейса можно использовать только как дополнительный контекст, если они помогают. Не копируй сухие формулировки:",
          baseSectionsContext,
          "Заверши ответ отдельной строкой: [END_OF_REPORT]",
        ].join("\n\n")
      : [
          `Write only one premium PDF section for ${profile.name}.`,
          instruction.en,
          "The text must be cohesive, with logical transitions, sections and subsections. Do not write phrases like “this is a story”, “story interpretation”, or “in this story”.",
          "Do not use dry phrases such as “The Sun shows identity...” or “the placement describes temperament...”. Explain specifically from the chart data: what the placement means, through which life sphere it expresses itself, and how it may appear in behavior.",
          `Length: ${instruction.words} words.`,
          "Markdown headings ## and ### are allowed. No tables.",
          "Chart data:",
          chartContext,
          "Existing interface text may be used only as additional context. Do not copy generic wording:",
          baseSectionsContext,
          "End with a separate line: [END_OF_REPORT]",
        ].join("\n\n");

  return {
    systemInstruction,
    userPrompt,
    model: PREMIUM_PDF_MODEL,
    temperature: 0.5,
    maxOutputTokens: 3000,
  };
}

export function parsePremiumPdfNarrative(text: string): PremiumPdfNarrative {
  const result: Record<keyof PremiumPdfNarrative, string> = {
    planets: "",
    houses: "",
    aspects: "",
    portrait: "",
  };
  const markerToKey: Record<string, keyof PremiumPdfNarrative> = {
    PLANETS: "planets",
    HOUSES: "houses",
    ASPECTS: "aspects",
    PORTRAIT: "portrait",
  };
  let currentKey: keyof PremiumPdfNarrative | null = null;

  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const marker = rawLine.trim().match(/^\[(PLANETS|HOUSES|ASPECTS|PORTRAIT|END_OF_REPORT)\]$/i);
    if (marker) {
      const markerName = marker[1].toUpperCase();
      currentKey = markerName === "END_OF_REPORT" ? null : markerToKey[markerName];
      continue;
    }

    if (currentKey) {
      result[currentKey] = `${result[currentKey]}${rawLine}\n`;
    }
  }

  return {
    planets: result.planets.trim() || undefined,
    houses: result.houses.trim() || undefined,
    aspects: result.aspects.trim() || undefined,
    portrait: result.portrait.trim() || undefined,
  };
}

export function buildDeepInterpretationPrompt(params: {
  chart: ChartResult;
  focusTopic: string;
  baseInterpretation: string;
  language: SupportedLanguage;
}): AiGenerateInput {
  const { chart, focusTopic, baseInterpretation, language } = params;
  const planetaryContext = buildPlanetaryContext(chart);
  const normalizedFocus = focusTopic.toLowerCase();
  const isAspectFocus =
    normalizedFocus.includes("conjunction") ||
    normalizedFocus.includes("opposition") ||
    normalizedFocus.includes("trine") ||
    normalizedFocus.includes("square") ||
    normalizedFocus.includes("sextile");

  const systemInstruction =
    language === "ru"
      ? "Ты астрологический аналитик. Дай глубокий, но СТРОГО фокусный разбор только по запрошенной теме. Не превращай ответ в общий обзор всей карты. Пиши понятным языком для человека без астрологической подготовки: каждый термин сразу объясняй простыми словами. Используй только предоставленные данные карты. Не добавляй внешние факты, транзиты, диагнозы и мед/юр советы."
      : "You are an astrology analyst. Provide a deep but STRICTLY focused reading only for the requested topic. Do not turn it into a full-chart overview. Write for a non-expert: explain each astrology term in plain language. Use only provided chart data. No external facts, transits, diagnoses, or medical/legal advice.";

  const userPrompt =
    language === "ru"
      ? [
          "Сделай фокусный глубокий разбор по теме ниже.",
          `Фокус: ${focusTopic}`,
          "Базовая интерпретация:",
          baseInterpretation,
          "Планетарный контекст карты:",
          planetaryContext,
          "Требования к формату ответа (строго):",
          "1) Русский язык, объем 150-250 слов.",
          `2) ${isAspectFocus
            ? "Раскрывай в первую очередь ИМЕННО этот аспект (с его планетами, знаками, домами и орбом)."
            : "Раскрывай ТОЛЬКО указанную тему, без общего разбора всей карты."}`,
          "3) Пиши для новичка: каждый термин (аспект, дом, орб и т.п.) сразу поясняй простыми словами.",
          "4) Обязательно добавь раздел 'Простыми словами': коротко, что это значит в обычной жизни без астросленга.",
          "5) Структура: 2-3 коротких раздела Markdown (### ...).",
          "6) Разрешено упомянуть 1-2 поддерживающих фактора, но только если они напрямую связаны с темой.",
          "7) Добавь 1-2 бытовых примера проявления темы.",
          "8) В конце блок: 'Практика' с 2 конкретными шагами по теме.",
          "9) Без таблиц, без длинных отступлений, без повторов.",
          "10) Заверши ответ строкой: [END_OF_REPORT]",
        ].join("\n\n")
      : [
          "Create a focused deep interpretation for the topic below.",
          `Focus: ${focusTopic}`,
          "Base interpretation:",
          baseInterpretation,
          "Planetary chart context:",
          planetaryContext,
          "Response requirements (strict):",
          "1) English, 150-250 words.",
          `2) ${isAspectFocus
            ? "Focus primarily on THIS requested aspect (its planets, signs, houses, and orb)."
            : "Focus ONLY on the requested topic, no full-chart overview."}`,
          "3) Write for non-experts: explain every astrology term (aspect, house, orb, etc.) in plain language right away.",
          "4) Include a mandatory section 'In plain language' that explains the meaning in everyday life without jargon.",
          "5) Use 2-3 short Markdown sections (### ...).",
          "6) Mention 1-2 supporting factors only if directly tied to the topic.",
          "7) Add 1-2 everyday examples involving human interactions.",
          "8) End with a 'Practice' section containing 2 actionable steps.",
          "9) No tables, no long detours, no repetition.",
          "10) End with a single line: [END_OF_REPORT]",
        ].join("\n\n");

  return {
    systemInstruction,
    userPrompt,
    temperature: 0.4,
    maxOutputTokens: 2600,
  };
}

export function buildOraclePrompt(params: {
  chart: ChartResult;
  question: string;
  language: SupportedLanguage;
}): AiGenerateInput {
  const { chart, question, language } = params;
  const planetaryContext = buildPlanetaryContext(chart);

  const systemInstruction =
    language === "ru"
      ? "Ты Оракул натальной карты. Отвечай только на основе предоставленных планетарных позиций и аспектов. Не опирайся на общие гороскопы, не придумывай события, не давай советы по медицине/праву/финансам как эксперт."
      : "You are a natal-chart oracle. Answer only from the provided planetary positions and aspects. Do not rely on generic horoscopes, do not invent events, and do not provide medical/legal/financial expert advice.";

  const userPrompt =
    language === "ru"
      ? [
          "Вопрос пользователя:",
          question,
          "Планетарный контекст карты:",
          planetaryContext,
          "Формат ответа СТРОГО:",
          "1) Объем 220-420 слов, законченный цельный ответ.",
          "2) Структура: 'Вывод', 'Логика карты', 'Риски и опоры', 'Практический фокус'.",
          "3) В разделе 'Логика карты' дай 4-6 коротких пунктов, каждый с конкретной ссылкой на планеты/знаки/дома/аспекты из данных.",
          "4) В 'Риски и опоры' покажи минимум 2 риска и 2 ресурса, опираясь на карту.",
          "5) В 'Практический фокус' дай 3-5 четких шагов, напрямую связанных с указанными астрологическими факторами.",
          "6) Без воды, без общих фраз, без цитат и технических артефактов.",
          "7) Используй только данные этой натальной карты. Не добавляй транзиты и внешние события.",
          "8) Заверши ответ строкой: [END_OF_REPORT]",
        ].join("\n\n")
      : [
          "User question:",
          question,
          "Planetary chart context:",
          planetaryContext,
          "STRICT response format:",
          "1) 220-420 words, complete finished answer.",
          "2) Structure: 'Conclusion', 'Chart logic', 'Risks and supports', 'Practical focus'.",
          "3) In 'Chart logic', provide 4-6 short bullets, each grounded in concrete planets/signs/houses/aspects from the data.",
          "4) In 'Risks and supports', include at least 2 risks and 2 resources tied to chart factors.",
          "5) In 'Practical focus', give 3-5 clear actions directly linked to the cited astrological factors.",
          "6) No fluff, no generic statements, no quotes or continuation artifacts.",
          "7) Use only this natal chart data. No transits or external event claims.",
          "8) End with a single line: [END_OF_REPORT]",
        ].join("\n\n");

  return {
    systemInstruction,
    userPrompt,
    temperature: 0.3,
    maxOutputTokens: 2000,
  };
}

function buildSynastryAspectContext(params: {
  chartA: ChartResult;
  chartB: ChartResult;
  personAName: string;
  personBName: string;
}): string {
  const { chartA, chartB, personAName, personBName } = params;
  const aspects = [];

  for (const pointA of chartA.points) {
    for (const pointB of chartB.points) {
      const aspect = detectAspect(
        pointA.body,
        pointA.lon,
        pointB.body,
        pointB.lon,
      );
      if (aspect) {
        aspects.push(aspect);
      }
    }
  }

  aspects.sort((a, b) => b.exactness - a.exactness);

  return aspects
    .slice(0, 20)
    .map(
      (aspect) =>
        `${personAName} ${aspect.a} ${aspect.type} ${personBName} ${aspect.b} (orb ${aspect.orb.toFixed(2)} deg, exactness ${aspect.exactness.toFixed(2)})`,
    )
    .join("\n");
}

export function buildRelationshipPrompt(params: {
  chartA: ChartResult;
  chartB: ChartResult;
  personAName: string;
  personBName: string;
  language: SupportedLanguage;
}): AiGenerateInput {
  const { chartA, chartB, personAName, personBName, language } = params;
  const contextA = buildPlanetaryContext(chartA);
  const contextB = buildPlanetaryContext(chartB);
  const synastryContext = buildSynastryAspectContext({
    chartA,
    chartB,
    personAName,
    personBName,
  });

  const systemInstruction =
    language === "ru"
      ? "Ты астрологический аналитик совместимости (синастрия). Дай разбор отношений только по данным двух натальных карт. Пиши простым языком для не-астролога. Не используй транзиты, внешние события, диагнозы и мед/юр/фин советы."
      : "You are a synastry (relationship compatibility) astrology analyst. Provide a relationship reading only from two natal charts. Write in plain language for non-experts. No transits, external event claims, diagnoses, or legal/medical/financial expert advice.";

  const userPrompt =
    language === "ru"
      ? [
          `Сделай расклад на отношения для пары: ${personAName} и ${personBName}.`,
          `Карта ${personAName}:`,
          contextA,
          `Карта ${personBName}:`,
          contextB,
          "Межкартные аспекты (синастрия):",
          synastryContext || "none",
          "Требования к ответу:",
          "1) Русский язык, 380-700 слов.",
          "2) Структура Markdown: ### Общая динамика, ### Притяжение и близость, ### Коммуникация и конфликты, ### Ресурсы пары, ### Риски пары, ### Практика.",
          "3) В тексте используй минимум 6 конкретных ссылок на факторы карт (планеты, знаки, дома, аспекты, орбы).",
          "4) Каждый астрологический термин сразу поясняй простыми словами.",
          "5) В разделе 'Практика' дай 5 конкретных шагов для улучшения взаимодействия.",
          "6) Без таблиц, без воды, без общих гороскопных фраз.",
          "7) Заверши ответ строкой: [END_OF_REPORT]",
        ].join("\n\n")
      : [
          `Create a relationship reading for: ${personAName} and ${personBName}.`,
          `${personAName} chart:`,
          contextA,
          `${personBName} chart:`,
          contextB,
          "Cross-chart synastry aspects:",
          synastryContext || "none",
          "Response requirements:",
          "1) English, 380-700 words.",
          "2) Markdown structure: ### Overall dynamic, ### Attraction and intimacy, ### Communication and conflict, ### Relationship strengths, ### Relationship risks, ### Practice.",
          "3) Include at least 6 concrete references to chart factors (planets, signs, houses, aspects, orbs).",
          "4) Explain each astrology term in plain language immediately.",
          "5) In 'Practice', provide 5 specific actions to improve interactions.",
          "6) No tables, no fluff, no generic horoscope statements.",
          "7) End with a single line: [END_OF_REPORT]",
        ].join("\n\n");

  return {
    systemInstruction,
    userPrompt,
    temperature: 0.35,
    maxOutputTokens: 2400,
  };
}

function sanitizeAiOutput(input: string): string {
  const rawLines = input
    .replace(/\r\n/g, "\n")
    .split("\n");

  const filteredLines = rawLines.filter((line) => {
      const normalized = line.trim().toLowerCase();
      return !(
        normalized.startsWith("of fragment to start from") ||
        normalized.startsWith("*continuation:*") ||
        normalized.startsWith("last generated fragment:") ||
        normalized.startsWith("continue the same answer") ||
        normalized.startsWith('"of fragment to start from') ||
        normalized === '"' ||
        normalized === "'"
      );
    });

  // Remove near-duplicate adjacent lines keeping the longer one.
  const deduped: string[] = [];
  for (const line of filteredLines) {
    const current = line.trim();
    if (!current) {
      deduped.push(line);
      continue;
    }

    const prev = deduped.length > 0 ? deduped[deduped.length - 1].trim() : "";
    const prevLower = prev.toLowerCase();
    const currentLower = current.toLowerCase();

    if (
      prevLower &&
      (prevLower === currentLower ||
        prevLower.startsWith(currentLower) ||
        currentLower.startsWith(prevLower))
    ) {
      if (current.length > prev.length) {
        deduped[deduped.length - 1] = line;
      }
      continue;
    }

    deduped.push(line);
  }

  return deduped
    .join("\n")
    .replace(/\*Continuation:\*\s*/gi, "")
    .replace(/\[END_OF_REPORT\]/g, "")
    .replace(/^["']+\s*/gm, "")
    .replace(/\s*["']+\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function callClaudeOnce(
  input: AiGenerateInput,
  apiKey: string,
  model: string,
): Promise<ClaudeCallResult> {
  const endpoint = new URL("https://api.anthropic.com/v1/messages");

  const payload = JSON.stringify({
    model,
    max_tokens: input.maxOutputTokens ?? 800,
    temperature: input.temperature ?? 0.5,
    system: input.systemInstruction,
    messages: [
      {
        role: "user",
        content: input.userPrompt,
      },
    ],
  });

  const response = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
    const req = request(
      endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];

        res.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 500,
            body: Buffer.concat(chunks).toString("utf-8"),
          });
        });
      },
    );

    req.on("error", reject);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error("Claude API request timed out"));
    });
    req.write(payload);
    req.end();
  });

  let parsed: AnthropicMessageResponse | null = null;
  try {
    parsed = JSON.parse(response.body) as AnthropicMessageResponse;
  } catch {
    // Keep parsed as null and raise below.
  }

  if (response.statusCode >= 400) {
    const apiError = parsed?.error?.message;
    throw new Error(apiError ?? `Claude API error (${response.statusCode})`);
  }

  const text = parsed?.content
    ?.filter((block) => block.type === "text" || block.text !== undefined)
    .map((block) => block.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Claude returned an empty response");
  }

  return {
    text,
    stopReason: parsed?.stop_reason ?? null,
    model: parsed?.model ?? model,
  };
}

export async function generateClaudeTextResult(
  input: AiGenerateInput,
  options: AiGenerateOptions = {},
): Promise<AiTextResult> {
  const apiKey = normalizeAnthropicApiKey(process.env.ANTHROPIC_API_KEY);
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  if (!ANTHROPIC_API_KEY_PATTERN.test(apiKey)) {
    throw new Error("ANTHROPIC_API_KEY is malformed");
  }

  const allowContinuation = options.allowContinuation ?? true;
  const sanitizeOutput = options.sanitizeOutput ?? true;
  const requireEndTag = options.requireEndTag ?? null;
  const configuredModel = process.env.ANTHROPIC_MODEL?.trim();
  const model = input.model?.trim() || configuredModel || DEFAULT_MODEL;
  let usedModel = model;
  let fullText = "";
  let prompt = input.userPrompt;

  // If the model hits token cap (or doesn't include the expected end tag), optionally request continuation.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await callClaudeOnce(
      { ...input, userPrompt: prompt },
      apiKey,
      model,
    );

    usedModel = result.model;
    fullText = fullText ? `${fullText}\n\n${result.text}` : result.text;

    if (requireEndTag) {
      // End-tag mode: keep going until we see the tag (or we can't continue).
      if (fullText.includes(requireEndTag) || !allowContinuation) {
        const finalText = fullText.trim();
        return {
          text: sanitizeOutput ? sanitizeAiOutput(finalText) : finalText,
          model: usedModel,
        };
      }
    } else {
      // Default mode: only continue when the model explicitly hit max tokens.
      if (result.stopReason !== "max_tokens" || !allowContinuation) {
        const finalText = fullText.trim();
        return {
          text: sanitizeOutput ? sanitizeAiOutput(finalText) : finalText,
          model: usedModel,
        };
      }
    }

    const tail = fullText.slice(-1800);
    prompt = [
      "Continue the SAME answer from the exact stopping point.",
      "Do not repeat previous sections, do not restart, no intro.",
      "Keep the exact same language and style.",
      ...(requireEndTag ? [`Make sure to end the full answer with: ${requireEndTag}`] : []),
      "Last generated fragment:",
      tail,
    ].join("\n\n");
  }

  const finalText = fullText.trim();
  return {
    text: sanitizeOutput ? sanitizeAiOutput(finalText) : finalText,
    model: usedModel,
  };
}

export async function generateClaudeText(
  input: AiGenerateInput,
  options: AiGenerateOptions = {},
): Promise<string> {
  const result = await generateClaudeTextResult(input, options);
  return result.text;
}

export function getClaudeModelName(): string {
  const configuredModel = process.env.ANTHROPIC_MODEL?.trim();
  return configuredModel || DEFAULT_MODEL;
}
