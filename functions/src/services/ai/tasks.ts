import * as P from "./defaultPrompts";
import type { GenerationOptions } from "./generate";

/**
 * Registry of every AI task the backend runs (DEC-003): what the admin sees in
 * the AI tab, the editable prompt parts with their placeholders, and the code
 * defaults (today's models, limits and prompts). The AI tab is built from this
 * list, so a task added here appears there without UI changes (REQ-001).
 */

export type AiTaskId =
  | "oracle"
  | "oracleLetter"
  | "compatibility"
  | "deepen"
  | "forecast"
  | "premiumPdf"
  | "letterAnalysis"
  | "letterWriting"
  | "newsDigest"
  | "factExtraction";

/** "all": one text for every output language (the task writes the language into the prompt itself). */
export type TextLanguage = "en" | "ru" | "all";

export interface PlaceholderSpec {
  name: string;
  description: string;
  /** May be left out of the text (by default every placeholder of a part is required). */
  optional?: boolean;
  /** An optional block: when empty and alone on its line, the line and the blank lines above it disappear. */
  collapsible?: boolean;
}

export interface PromptPartSpec {
  key: string;
  label: string;
  description: string;
  placeholders: readonly PlaceholderSpec[];
}

/** Prompt texts of one language: part key -> template. */
export type TaskTexts = Record<string, string>;

export type TestInput = "question" | "topic" | "baseInterpretation" | "partnerProfileId" | "section";

export interface AiTaskSpec {
  id: AiTaskId;
  label: string;
  description: string;
  languages: readonly TextLanguage[];
  parts: readonly PromptPartSpec[];
  defaults: {
    model: string;
    maxOutputTokens: number;
    temperature: number | null;
    texts: Partial<Record<TextLanguage, TaskTexts>>;
  };
  /** Fixed by the code: how the answer is generated and cleaned. */
  generation: GenerationOptions;
  /** Extra input a test run needs besides the profile (REQ-009). */
  testInputs: readonly TestInput[];
}

const SYSTEM = "System prompt";
const USER = "User message";
const SYSTEM_HELP = "Instructions the model follows for every request of this task.";
const USER_HELP = "The request itself. The server fills the placeholders with the data of the request.";
const LANGUAGE: PlaceholderSpec = {
  name: "language",
  description: "Name of the output language in English, e.g. English",
  optional: true,
};
const END_TAG_GENERATION: GenerationOptions = { continuation: true, sanitize: true, requireEndTag: "[END_OF_REPORT]" };

const ORACLE_PARTS: readonly PromptPartSpec[] = [
  {
    key: "system",
    label: SYSTEM,
    description: SYSTEM_HELP,
    placeholders: [
      {
        name: "personalBlock",
        description: "The \"Known facts about the person\" text below, or nothing when nothing is known yet",
        collapsible: true,
      },
    ],
  },
  {
    key: "personalBlock",
    label: "Known facts about the person",
    description: "Added to the system prompt when the person's dossier has facts.",
    placeholders: [{ name: "dossier", description: "Facts from the person's dossier, one per line" }],
  },
  {
    key: "user",
    label: USER,
    description: USER_HELP,
    placeholders: [
      { name: "question", description: "The user's question" },
      { name: "chart", description: "Planet positions, houses and the strongest aspects of the chart" },
    ],
  },
];

const ORACLE_TEXTS: AiTaskSpec["defaults"]["texts"] = {
  en: { system: P.ORACLE_SYSTEM_EN, personalBlock: P.ORACLE_PERSONAL_EN, user: P.ORACLE_USER_EN },
  ru: { system: P.ORACLE_SYSTEM_RU, personalBlock: P.ORACLE_PERSONAL_RU, user: P.ORACLE_USER_RU },
};

const PDF_SECTION_PART = (key: string, section: string): PromptPartSpec => ({
  key,
  label: `Instruction: ${section}`,
  description: `What the ${section} section must cover. Inserted as {{sectionInstruction}}.`,
  placeholders: [],
});
const PDF_LENGTH_PART = (key: string, section: string): PromptPartSpec => ({
  key,
  label: `Length: ${section}`,
  description: `Word range of the ${section} section, e.g. 900-1300. Inserted as {{length}}.`,
  placeholders: [],
});

export const AI_TASKS: readonly AiTaskSpec[] = [
  {
    id: "oracle",
    label: "Oracle",
    description: "Answers a question about the chart on the Oracle tab (costs one star).",
    languages: ["en", "ru"],
    parts: ORACLE_PARTS,
    defaults: { model: "claude-opus-4-8", maxOutputTokens: 2400, temperature: null, texts: ORACLE_TEXTS },
    generation: END_TAG_GENERATION,
    testInputs: ["question"],
  },
  {
    id: "oracleLetter",
    label: "Oracle in letters",
    description: "Answers a free-text question asked from inside a Personal Astrologer letter (costs one star).",
    languages: ["en", "ru"],
    parts: ORACLE_PARTS,
    defaults: { model: "claude-opus-4-8", maxOutputTokens: 2400, temperature: null, texts: ORACLE_TEXTS },
    generation: END_TAG_GENERATION,
    testInputs: ["question"],
  },
  {
    id: "compatibility",
    label: "Compatibility",
    description: "Relationship reading for two charts on the Compatibility tab (paid).",
    languages: ["en", "ru"],
    parts: [
      { key: "system", label: SYSTEM, description: SYSTEM_HELP, placeholders: [] },
      {
        key: "user",
        label: USER,
        description: USER_HELP,
        placeholders: [
          { name: "personA", description: "Name of the profile owner" },
          { name: "personB", description: "Name of the partner" },
          { name: "chartA", description: "Chart data of the profile owner" },
          { name: "chartB", description: "Chart data of the partner" },
          { name: "synastry", description: "The 20 strongest aspects between the two charts, or \"none\"" },
          LANGUAGE,
        ],
      },
    ],
    defaults: {
      model: "claude-opus-4-8",
      maxOutputTokens: 2400,
      temperature: null,
      texts: {
        en: { system: P.RELATIONSHIP_SYSTEM_EN, user: P.RELATIONSHIP_USER_EN },
        ru: { system: P.RELATIONSHIP_SYSTEM_RU, user: P.RELATIONSHIP_USER_RU },
      },
    },
    generation: END_TAG_GENERATION,
    testInputs: ["partnerProfileId"],
  },
  {
    id: "deepen",
    label: "Deeper interpretation",
    description: "\"Dig deeper\" text for one interpretation block (part of the Interpretations + PDF unlock). Cached per block.",
    languages: ["en", "ru"],
    parts: [
      { key: "system", label: SYSTEM, description: SYSTEM_HELP, placeholders: [] },
      {
        key: "user",
        label: USER,
        description: USER_HELP,
        placeholders: [
          { name: "focus", description: "The block being deepened, e.g. Sun in Aries or Sun trine Mars" },
          { name: "baseInterpretation", description: "The block's standard interpretation text" },
          { name: "chart", description: "Planet positions, houses and the strongest aspects of the chart" },
          { name: "focusRule", description: "\"Focus rule: aspect\" or \"Focus rule: other topic\" below" },
          LANGUAGE,
        ],
      },
      {
        key: "focusRuleAspect",
        label: "Focus rule: aspect",
        description: "Used as {{focusRule}} when the block is an aspect.",
        placeholders: [],
      },
      {
        key: "focusRuleTopic",
        label: "Focus rule: other topic",
        description: "Used as {{focusRule}} for every other block.",
        placeholders: [],
      },
    ],
    defaults: {
      model: "claude-sonnet-4-6",
      maxOutputTokens: 2600,
      temperature: 0.4,
      texts: {
        en: {
          system: P.DEEPEN_SYSTEM_EN,
          user: P.DEEPEN_USER_EN,
          focusRuleAspect: P.DEEPEN_RULE_ASPECT_EN,
          focusRuleTopic: P.DEEPEN_RULE_TOPIC_EN,
        },
        ru: {
          system: P.DEEPEN_SYSTEM_RU,
          user: P.DEEPEN_USER_RU,
          focusRuleAspect: P.DEEPEN_RULE_ASPECT_RU,
          focusRuleTopic: P.DEEPEN_RULE_TOPIC_RU,
        },
      },
    },
    generation: END_TAG_GENERATION,
    testInputs: ["topic", "baseInterpretation"],
  },
  {
    id: "forecast",
    label: "Daily forecast",
    description: "Free \"cosmic weather\" of the day for a profile. Cached per profile per day.",
    languages: ["en", "ru"],
    parts: [
      { key: "system", label: SYSTEM, description: SYSTEM_HELP, placeholders: [] },
      {
        key: "user",
        label: USER,
        description: USER_HELP,
        placeholders: [
          { name: "today", description: "Today's date, YYYY-MM-DD" },
          { name: "chart", description: "Planet positions, houses and the strongest aspects of the chart" },
        ],
      },
    ],
    defaults: {
      model: "claude-sonnet-4-6",
      maxOutputTokens: 1200,
      temperature: 0.5,
      texts: {
        en: { system: P.FORECAST_SYSTEM_EN, user: P.FORECAST_USER_EN },
        ru: { system: P.FORECAST_SYSTEM_RU, user: P.FORECAST_USER_RU },
      },
    },
    generation: END_TAG_GENERATION,
    testInputs: [],
  },
  {
    id: "premiumPdf",
    label: "Premium PDF sections",
    description: "The four AI sections (planets, houses, aspects, portrait) of the premium PDF, generated in parallel. Cached per profile.",
    languages: ["en", "ru"],
    parts: [
      { key: "system", label: SYSTEM, description: SYSTEM_HELP, placeholders: [LANGUAGE] },
      {
        key: "user",
        label: USER,
        description: USER_HELP,
        placeholders: [
          { name: "name", description: "Name of the profile" },
          { name: "sectionInstruction", description: "The instruction of the section being written (below)" },
          { name: "length", description: "The word range of the section being written (below)" },
          { name: "chart", description: "Full chart data: person data, angles, planets, houses, aspects" },
          { name: "uiTexts", description: "Interpretation texts from the app the user sees, or \"none\"" },
        ],
      },
      PDF_SECTION_PART("sectionPlanets", "planets"),
      PDF_LENGTH_PART("lengthPlanets", "planets"),
      PDF_SECTION_PART("sectionHouses", "houses"),
      PDF_LENGTH_PART("lengthHouses", "houses"),
      PDF_SECTION_PART("sectionAspects", "aspects"),
      PDF_LENGTH_PART("lengthAspects", "aspects"),
      PDF_SECTION_PART("sectionPortrait", "portrait"),
      PDF_LENGTH_PART("lengthPortrait", "portrait"),
    ],
    defaults: {
      model: "claude-sonnet-4-6",
      maxOutputTokens: 8000,
      temperature: 0.5,
      texts: {
        en: {
          system: P.PDF_SYSTEM_EN,
          user: P.PDF_USER_EN,
          sectionPlanets: P.PDF_PLANETS_EN,
          lengthPlanets: P.PDF_PLANETS_LENGTH,
          sectionHouses: P.PDF_HOUSES_EN,
          lengthHouses: P.PDF_HOUSES_LENGTH,
          sectionAspects: P.PDF_ASPECTS_EN,
          lengthAspects: P.PDF_ASPECTS_LENGTH,
          sectionPortrait: P.PDF_PORTRAIT_EN,
          lengthPortrait: P.PDF_PORTRAIT_LENGTH,
        },
        ru: {
          system: P.PDF_SYSTEM_RU,
          user: P.PDF_USER_RU,
          sectionPlanets: P.PDF_PLANETS_RU,
          lengthPlanets: P.PDF_PLANETS_LENGTH,
          sectionHouses: P.PDF_HOUSES_RU,
          lengthHouses: P.PDF_HOUSES_LENGTH,
          sectionAspects: P.PDF_ASPECTS_RU,
          lengthAspects: P.PDF_ASPECTS_LENGTH,
          sectionPortrait: P.PDF_PORTRAIT_RU,
          lengthPortrait: P.PDF_PORTRAIT_LENGTH,
        },
      },
    },
    generation: END_TAG_GENERATION,
    testInputs: ["section"],
  },
  {
    id: "letterAnalysis",
    label: "Letter analysis",
    description: "First pass of a Personal Astrologer letter: picks themes, transits, news hooks and questions as JSON.",
    languages: ["all"],
    parts: [
      { key: "system", label: SYSTEM, description: `${SYSTEM_HELP} Must ask for the JSON the letter writer reads.`, placeholders: [] },
      {
        key: "user",
        label: USER,
        description: USER_HELP,
        placeholders: [
          { name: "dossier", description: "Dossier as JSON: language, address form, interests, goals, open loops, style" },
          { name: "knownBlock", description: "\"Already known\" below, or nothing", collapsible: true },
          { name: "askedBlock", description: "\"Already asked\" below, or nothing", collapsible: true },
          { name: "residence", description: "Place of residence (houses are relocated there)" },
          { name: "natal", description: "Natal planets with signs, degrees and houses" },
          { name: "transitPositions", description: "Current planet positions" },
          { name: "transitAspects", description: "Transit aspects to the natal chart" },
          { name: "news", description: "News digest hooks as JSON" },
          { name: "recentBlock", description: "\"Recent question\" or \"First letter\" below" },
        ],
      },
      {
        key: "knownBlock",
        label: "Already known",
        description: "Added when the dossier has facts.",
        placeholders: [{ name: "known", description: "Facts from the dossier, one per line" }],
      },
      {
        key: "askedBlock",
        label: "Already asked",
        description: "Added when earlier letters asked questions.",
        placeholders: [{ name: "asked", description: "Topics and questions of the last letters, comma-separated" }],
      },
      {
        key: "recentQuestion",
        label: "Recent question",
        description: "Used as {{recentBlock}} when the person asked the Oracle before.",
        placeholders: [{ name: "question", description: "The person's last Oracle question" }],
      },
      {
        key: "coldStart",
        label: "First letter",
        description: "Used as {{recentBlock}} when the person never asked the Oracle.",
        placeholders: [],
      },
    ],
    defaults: {
      model: "claude-opus-4-8",
      maxOutputTokens: 1500,
      temperature: null,
      texts: {
        all: {
          system: P.LETTER_ANALYSIS_SYSTEM,
          user: P.LETTER_ANALYSIS_USER,
          knownBlock: P.LETTER_ANALYSIS_KNOWN,
          askedBlock: P.LETTER_ANALYSIS_ASKED,
          recentQuestion: P.LETTER_ANALYSIS_RECENT,
          coldStart: P.LETTER_ANALYSIS_COLD_START,
        },
      },
    },
    generation: { continuation: false, sanitize: false },
    testInputs: [],
  },
  {
    id: "letterWriting",
    label: "Letter writing",
    description: "Second pass of a Personal Astrologer letter: writes the letter as JSON from the analysis brief.",
    languages: ["all"],
    parts: [
      {
        key: "system",
        label: SYSTEM,
        description: `${SYSTEM_HELP} Must ask for the JSON the app reads (teaser, html, questions).`,
        placeholders: [
          { name: "astrologer", description: "The astrologer's name chosen by the subscriber (default Vega)" },
          { name: "language", description: "Output language as a Russian word in the prepositional case: русском or английском" },
          { name: "addressForm", description: "Grammatical gender to address the person: женский род, мужской род or нейтральный род" },
        ],
      },
      {
        key: "user",
        label: USER,
        description: USER_HELP,
        placeholders: [{ name: "brief", description: "The analysis brief as JSON" }],
      },
    ],
    defaults: {
      model: "claude-opus-4-8",
      maxOutputTokens: 2000,
      temperature: null,
      texts: { all: { system: P.LETTER_WRITING_SYSTEM, user: P.LETTER_WRITING_USER } },
    },
    generation: { continuation: false, sanitize: false },
    testInputs: [],
  },
  {
    id: "newsDigest",
    label: "News digest",
    description: "Finds 2-3 fresh news items for a letter with the provider's web search, as JSON. Cached per day, region and interests.",
    languages: ["en", "ru"],
    parts: [
      { key: "system", label: SYSTEM, description: `${SYSTEM_HELP} Must ask for the JSON the letter reads.`, placeholders: [] },
      {
        key: "user",
        label: USER,
        description: USER_HELP,
        placeholders: [
          { name: "interests", description: "The person's interests, comma-separated, or \"general\"" },
          { name: "region", description: "Place of residence" },
          { name: "date", description: "Today's date, YYYY-MM-DD" },
        ],
      },
    ],
    defaults: {
      model: "claude-sonnet-4-6",
      maxOutputTokens: 1200,
      temperature: null,
      texts: {
        en: { system: P.NEWS_DIGEST_SYSTEM_EN, user: P.NEWS_DIGEST_USER },
        ru: { system: P.NEWS_DIGEST_SYSTEM_RU, user: P.NEWS_DIGEST_USER },
      },
    },
    generation: { continuation: false, sanitize: false, webSearch: { maxUses: 2 } },
    testInputs: [],
  },
  {
    id: "factExtraction",
    label: "Fact extraction",
    description: "Background pass after an Oracle question: extracts durable facts about the person into the dossier, as JSON.",
    languages: ["all"],
    parts: [
      { key: "system", label: SYSTEM, description: `${SYSTEM_HELP} Must ask for the JSON array the dossier reads.`, placeholders: [] },
      {
        key: "user",
        label: USER,
        description: USER_HELP,
        placeholders: [{ name: "question", description: "The user's Oracle question (first 2000 characters)" }],
      },
    ],
    defaults: {
      model: "claude-haiku-4-5",
      maxOutputTokens: 500,
      temperature: 0,
      texts: { all: { system: P.FACT_EXTRACTION_SYSTEM, user: P.FACT_EXTRACTION_USER } },
    },
    generation: { continuation: true, sanitize: false },
    testInputs: ["question"],
  },
];

const TASKS_BY_ID = new Map(AI_TASKS.map((task) => [task.id, task]));

export function isAiTaskId(value: unknown): value is AiTaskId {
  return typeof value === "string" && TASKS_BY_ID.has(value as AiTaskId);
}

export function taskSpec(id: AiTaskId): AiTaskSpec {
  const task = TASKS_BY_ID.get(id);
  if (!task) throw new Error(`Unknown AI task: ${id}`);
  return task;
}

/** Which text set a request in `language` uses. */
export function textLanguageFor(task: AiTaskSpec, language: "en" | "ru"): TextLanguage {
  return task.languages.includes(language) ? language : "all";
}

export function partSpec(task: AiTaskSpec, key: string): PromptPartSpec | undefined {
  return task.parts.find((part) => part.key === key);
}

export function collapsiblePlaceholders(part: PromptPartSpec): Set<string> {
  return new Set(part.placeholders.filter((p) => p.collapsible).map((p) => p.name));
}
