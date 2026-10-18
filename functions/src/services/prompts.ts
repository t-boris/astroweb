import type { ChartResult, Profile } from "../types";
import { detectAspect } from "../astro/aspects";
import type { GenerationPrompt } from "./ai/generate";
import { fillTemplate } from "./ai/template";
import { collapsiblePlaceholders, partSpec, taskSpec, textLanguageFor, type AiTaskId, type TaskTexts } from "./ai/tasks";

/*
 * Prompt builders of every AI task. The prompt texts are templates (code
 * defaults in ai/defaultPrompts.ts, admin overrides in aiSettings, DEC-011);
 * these functions build the data each task inserts and fill the templates.
 * Which model runs a prompt and with which limits comes from the task's
 * settings (ai/settings.ts), not from here.
 */

export type SupportedLanguage = "ru" | "en";

/**
 * Language a prompt template is written in. Russian has its own templates;
 * every other output language uses the English templates plus an explicit
 * output-language directive (see withOutputLanguage).
 */
export type PromptLanguage = "ru" | "en";

export function promptLanguage(language: SupportedLanguage): PromptLanguage {
  return language === "ru" ? "ru" : "en";
}

const OUTPUT_LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: "English",
  ru: "Russian",
};

const OUTPUT_LANGUAGE_DIRECTIVES: Partial<Record<SupportedLanguage, string>> = {};

export function withOutputLanguage(input: GenerationPrompt, language: SupportedLanguage): GenerationPrompt {
  const directive = OUTPUT_LANGUAGE_DIRECTIVES[language];
  if (!directive) return input;
  return {
    ...input,
    systemInstruction: `${input.systemInstruction}\n\n${directive}`,
    userPrompt: `${input.userPrompt}\n\n${directive}`,
  };
}

const BODY_LABELS: Record<string, Record<PromptLanguage, string>> = {
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

const SIGN_LABELS: Record<string, Record<PromptLanguage, string>> = {
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

const ASPECT_LABELS: Record<string, Record<PromptLanguage, string>> = {
  conjunction: { en: "conjunction", ru: "соединение" },
  sextile: { en: "sextile", ru: "секстиль" },
  square: { en: "square", ru: "квадратура" },
  trine: { en: "trine", ru: "тригон" },
  opposition: { en: "opposition", ru: "оппозиция" },
};

const HOUSE_TOPICS: Record<number, Record<PromptLanguage, string>> = {
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
  labels: Record<string, Record<PromptLanguage, string>>,
  key: string,
  language: PromptLanguage,
): string {
  return labels[key]?.[language] ?? key;
}

function formatLocalizedDegree(value: number): string {
  return `${value.toFixed(2)}°`;
}

function formatLocalizedLongitude(longitude: number, language: PromptLanguage): string {
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
  language: PromptLanguage;
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

// ---- Template rendering -----------------------------------------------------

function defaultTexts(taskId: AiTaskId, language: PromptLanguage): TaskTexts {
  const task = taskSpec(taskId);
  return task.defaults.texts[textLanguageFor(task, language)] ?? {};
}

/** Fill one prompt part of a task with `values`; optional blocks collapse when empty. */
function render(taskId: AiTaskId, key: string, texts: TaskTexts, values: Record<string, string> = {}): string {
  const part = partSpec(taskSpec(taskId), key);
  return fillTemplate(texts[key] ?? "", values, part ? collapsiblePlaceholders(part) : new Set());
}

// ---- Builders -----------------------------------------------------------------

const PDF_PART_KEYS: Record<PremiumPdfNarrativeSection, { instruction: string; length: string }> = {
  planets: { instruction: "sectionPlanets", length: "lengthPlanets" },
  houses: { instruction: "sectionHouses", length: "lengthHouses" },
  aspects: { instruction: "sectionAspects", length: "lengthAspects" },
  portrait: { instruction: "sectionPortrait", length: "lengthPortrait" },
};

/** One of the four AI sections of the premium PDF (task premiumPdf). */
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
  texts?: TaskTexts;
}): GenerationPrompt {
  const { profile, chart, language: outputLanguage, sections, section, isRelocated } = params;
  const language = promptLanguage(outputLanguage);
  const texts = params.texts ?? defaultTexts("premiumPdf", language);
  const keys = PDF_PART_KEYS[section];

  return withOutputLanguage({
    systemInstruction: render("premiumPdf", "system", texts, { language: OUTPUT_LANGUAGE_NAMES[outputLanguage] }),
    userPrompt: render("premiumPdf", "user", texts, {
      name: profile.name,
      sectionInstruction: render("premiumPdf", keys.instruction, texts),
      length: render("premiumPdf", keys.length, texts),
      chart: buildPremiumPdfChartContext({ profile, chart, language, isRelocated }),
      uiTexts: buildBaseSectionsContext(sections),
    }),
  }, outputLanguage);
}

/** "Dig deeper" text for one interpretation block (task deepen). */
export function buildDeepInterpretationPrompt(params: {
  chart: ChartResult;
  focusTopic: string;
  baseInterpretation: string;
  language: SupportedLanguage;
  texts?: TaskTexts;
}): GenerationPrompt {
  const { chart, focusTopic, baseInterpretation, language: outputLanguage } = params;
  const language = promptLanguage(outputLanguage);
  const texts = params.texts ?? defaultTexts("deepen", language);
  const normalizedFocus = focusTopic.toLowerCase();
  const isAspectFocus =
    normalizedFocus.includes("conjunction") ||
    normalizedFocus.includes("opposition") ||
    normalizedFocus.includes("trine") ||
    normalizedFocus.includes("square") ||
    normalizedFocus.includes("sextile");

  return withOutputLanguage({
    systemInstruction: render("deepen", "system", texts),
    userPrompt: render("deepen", "user", texts, {
      focus: focusTopic,
      baseInterpretation,
      chart: buildPlanetaryContext(chart),
      focusRule: render("deepen", isAspectFocus ? "focusRuleAspect" : "focusRuleTopic", texts),
      language: OUTPUT_LANGUAGE_NAMES[outputLanguage],
    }),
  }, outputLanguage);
}

/** Oracle answer (tasks oracle and oracleLetter share the prompt shape). */
export function buildOraclePrompt(params: {
  chart: ChartResult;
  question: string;
  language: SupportedLanguage;
  dossierSummary?: string;
  taskId?: "oracle" | "oracleLetter";
  texts?: TaskTexts;
}): GenerationPrompt {
  const { chart, question, language: outputLanguage, dossierSummary } = params;
  const taskId = params.taskId ?? "oracle";
  const language = promptLanguage(outputLanguage);
  const texts = params.texts ?? defaultTexts(taskId, language);
  const personalBlock =
    dossierSummary && dossierSummary.trim() ? render(taskId, "personalBlock", texts, { dossier: dossierSummary }) : "";

  return withOutputLanguage({
    systemInstruction: render(taskId, "system", texts, { personalBlock }),
    userPrompt: render(taskId, "user", texts, { question, chart: buildPlanetaryContext(chart) }),
  }, outputLanguage);
}

/** Compatibility reading of two charts (task compatibility). */
export function buildRelationshipPrompt(params: {
  chartA: ChartResult;
  chartB: ChartResult;
  personAName: string;
  personBName: string;
  language: SupportedLanguage;
  texts?: TaskTexts;
}): GenerationPrompt {
  const { chartA, chartB, personAName, personBName, language: outputLanguage } = params;
  const language = promptLanguage(outputLanguage);
  const texts = params.texts ?? defaultTexts("compatibility", language);
  const synastryContext = buildSynastryAspectContext({ chartA, chartB, personAName, personBName });

  return withOutputLanguage({
    systemInstruction: render("compatibility", "system", texts),
    userPrompt: render("compatibility", "user", texts, {
      personA: personAName,
      personB: personBName,
      chartA: buildPlanetaryContext(chartA),
      chartB: buildPlanetaryContext(chartB),
      synastry: synastryContext || "none",
      language: OUTPUT_LANGUAGE_NAMES[outputLanguage],
    }),
  }, outputLanguage);
}

/** Daily "cosmic weather" forecast (task forecast). */
export function buildForecastPrompt(params: {
  chart: ChartResult;
  today: string;
  language: SupportedLanguage;
  texts?: TaskTexts;
}): GenerationPrompt {
  const { chart, today, language } = params;
  const texts = params.texts ?? defaultTexts("forecast", promptLanguage(language));

  return withOutputLanguage({
    systemInstruction: render("forecast", "system", texts),
    userPrompt: render("forecast", "user", texts, { today, chart: buildPlanetaryContext(chart) }),
  }, language);
}

/** Inputs of the letter analysis pass (letterEngine.generateLetter). */
export interface LetterAnalysisPromptInput {
  language: "ru" | "en";
  addressForm: string | null;
  interests: string[];
  goals: unknown;
  openLoops: unknown;
  styleProfile: unknown;
  styleNudge: unknown;
  knownText: string;
  askedKeys: string[];
  residencePlace: string;
  chart: ChartResult;
  transit: { positions: string; aspects: string };
  newsHooks: unknown;
  recentQuestion: string | null;
}


/** Letter analysis pass: picks themes, transits, news hooks and questions as JSON (task letterAnalysis). */
export function buildLetterAnalysisPrompt(params: LetterAnalysisPromptInput & { texts?: TaskTexts }): GenerationPrompt {
  const { chart, transit, knownText, askedKeys } = params;
  const texts = params.texts ?? defaultTexts("letterAnalysis", params.language);
  const dossier = {
    language: params.language,
    addressForm: params.addressForm,
    interests: params.interests,
    goals: params.goals,
    openLoops: params.openLoops,
    styleProfile: params.styleProfile,
    styleNudge: params.styleNudge,
  };

  return {
    systemInstruction: render("letterAnalysis", "system", texts),
    userPrompt: render("letterAnalysis", "user", texts, {
      dossier: JSON.stringify(dossier),
      knownBlock: knownText ? render("letterAnalysis", "knownBlock", texts, { known: knownText }) : "",
      askedBlock: askedKeys.length ? render("letterAnalysis", "askedBlock", texts, { asked: askedKeys.join(", ") }) : "",
      residence: params.residencePlace,
      natal: chart.points
        .map((p) => `${p.body} ${p.sign} ${Math.floor(p.degreeInSign)}°${p.house ? ` д${p.house}` : ""}`)
        .join(" · "),
      transitPositions: transit.positions,
      transitAspects: transit.aspects,
      news: JSON.stringify(params.newsHooks),
      recentBlock: params.recentQuestion
        ? render("letterAnalysis", "recentQuestion", texts, { question: params.recentQuestion })
        : render("letterAnalysis", "coldStart", texts),
    }),
  };
}

/** Letter writing pass: turns the analysis brief into the letter JSON in the astrologer's voice (task letterWriting). */
export function buildLetterGenerationPrompt(params: {
  astrologerName: string;
  language: "ru" | "en";
  addressForm: string | null;
  brief: unknown;
  texts?: TaskTexts;
}): GenerationPrompt {
  const texts = params.texts ?? defaultTexts("letterWriting", params.language);
  const addressForm =
    params.addressForm === "feminine" ? "женский род" : params.addressForm === "masculine" ? "мужской род" : "нейтральный род";

  return {
    systemInstruction: render("letterWriting", "system", texts, {
      astrologer: params.astrologerName,
      language: params.language === "ru" ? "русском" : "английском",
      addressForm,
    }),
    userPrompt: render("letterWriting", "user", texts, { brief: JSON.stringify(params.brief) }),
  };
}

/** News digest for letters: 2-3 fresh news items found with web search, as JSON (task newsDigest). */
export function buildNewsDigestPrompt(params: {
  interestTags: string[];
  residence: string;
  language: "ru" | "en";
  date: string;
  texts?: TaskTexts;
}): GenerationPrompt {
  const texts = params.texts ?? defaultTexts("newsDigest", params.language);
  return {
    systemInstruction: render("newsDigest", "system", texts),
    userPrompt: render("newsDigest", "user", texts, {
      interests: params.interestTags.join(", ") || "general",
      region: params.residence,
      date: params.date,
    }),
  };
}

/** Background fact extraction from an Oracle question, as a JSON array (task factExtraction). */
export function buildFactExtractionPrompt(params: { text: string; texts?: TaskTexts }): GenerationPrompt {
  const texts = params.texts ?? defaultTexts("factExtraction", "en");
  return {
    systemInstruction: render("factExtraction", "system", texts),
    userPrompt: render("factExtraction", "user", texts, { question: params.text.slice(0, 2000) }),
  };
}
