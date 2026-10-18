import { describe, expect, it } from "vitest";
import {
  buildDeepInterpretationPrompt,
  buildFactExtractionPrompt,
  buildForecastPrompt,
  buildLetterAnalysisPrompt,
  buildLetterGenerationPrompt,
  buildNewsDigestPrompt,
  buildOraclePrompt,
  buildPremiumPdfNarrativeSectionPrompt,
  buildRelationshipPrompt,
} from "../services/anthropic";
import type { ChartResult, Profile } from "../types";

/**
 * Golden copy of every prompt the backend sends (REQ-004 of the admin AI
 * settings feature). The snapshot was recorded from the prompt builders before
 * prompts became editable templates; with no admin override the system must
 * keep producing exactly these texts and request parameters.
 */

const chartA: ChartResult = {
  meta: { houseSystem: "koch", zodiac: "tropical", timeUsed: "14:30", timezoneUsed: "Europe/Moscow" },
  points: [
    { body: "Sun", lon: 12.5, sign: "Aries", degreeInSign: 12.5, house: 10 },
    { body: "Moon", lon: 125.25, sign: "Leo", degreeInSign: 5.25, house: 2 },
    { body: "Venus", lon: 350.1, sign: "Pisces", degreeInSign: 20.1, house: 9 },
    { body: "Mars", lon: 252.75, sign: "Sagittarius", degreeInSign: 12.75, house: null },
  ],
  houses: {
    system: "koch",
    cusps: [100, 125, 150, 180, 215, 250, 280, 305, 330, 0, 35, 70],
    asc: 100,
    mc: 0,
  },
  aspects: [
    { a: "Sun", b: "Mars", type: "trine", orb: 0.25, exactness: 0.97 },
    { a: "Sun", b: "Moon", type: "trine", orb: 7.25, exactness: 0.4 },
    { a: "Moon", b: "Venus", type: "square", orb: 5.15, exactness: 0.52 },
  ],
};

const chartB: ChartResult = {
  meta: { houseSystem: "koch", zodiac: "tropical", timeUsed: null, timezoneUsed: "Europe/Berlin" },
  points: [
    { body: "Sun", lon: 192.5, sign: "Libra", degreeInSign: 12.5, house: null },
    { body: "Moon", lon: 10.0, sign: "Aries", degreeInSign: 10.0, house: null },
  ],
  houses: { system: "koch", cusps: [], asc: null, mc: null },
  aspects: [{ a: "Sun", b: "Moon", type: "opposition", orb: 2.5, exactness: 0.75 }],
};

const profile = {
  id: "p1",
  ownerDeviceId: "d1",
  name: "Anna",
  birthDate: "1990-04-02",
  birthTime: "14:30",
  timeUnknown: false,
  birthPlace: "Moscow, Russia",
  lat: 55.75,
  lng: 37.62,
  timezone: "Europe/Moscow",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
} as Profile;

const uiSections = [
  { title: "Sun in Aries", body: "Direct, brave and quick to start.", category: "planets", detail: "10th house" },
  { title: "Moon in Leo", body: "Needs warmth and recognition." },
];

function snapshotOf(input: {
  systemInstruction: string;
  userPrompt: string;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
}) {
  return {
    // No model means the transport default (claude-sonnet-4-6; ANTHROPIC_MODEL is not set in production).
    model: input.model ?? "claude-sonnet-4-6",
    temperature: input.temperature ?? null,
    maxOutputTokens: input.maxOutputTokens ?? null,
    system: input.systemInstruction,
    user: input.userPrompt,
  };
}

const languages = ["en", "ru"] as const;

const letterAnalysisBase = {
  addressForm: "feminine",
  interests: ["travel", "music"],
  goals: ["new job"],
  openLoops: ["moving abroad"],
  styleProfile: { humor: 0.4, seriousness: 0.5, formality: 0.2, warmth: 0.6, brevity: 0.6, mysticism: 0.4, emoji: 0.2 },
  styleNudge: null,
  residencePlace: "Berlin, Germany",
  chart: chartA,
  transit: { positions: "Sun Libra 25° · Moon Gemini 3°", aspects: "Sun square natal Moon (orb 1.2)" },
  newsHooks: [{ headline: "Jazz festival opens", oneLine: "A city-wide jazz festival starts this weekend." }],
};

const cases: Array<[string, () => Parameters<typeof snapshotOf>[0]]> = [];

for (const language of languages) {
  cases.push([`oracle.${language}.plain`, () => buildOraclePrompt({ chart: chartA, question: "Will I find a new job?", language })]);
  cases.push([
    `oracle.${language}.dossier`,
    () => buildOraclePrompt({ chart: chartA, question: "Will I find a new job?", language, dossierSummary: "Профессия: дизайнер\nИнтересы: музыка" }),
  ]);
  cases.push([
    `relationship.${language}`,
    () => buildRelationshipPrompt({ chartA, chartB, personAName: "Anna", personBName: "Max", language }),
  ]);
  cases.push([
    `relationship.${language}.noSynastry`,
    () => buildRelationshipPrompt({ chartA: chartB, chartB: { ...chartB, points: [] }, personAName: "Anna", personBName: "Max", language }),
  ]);
  cases.push([
    `deepen.${language}.topic`,
    () => buildDeepInterpretationPrompt({ chart: chartA, focusTopic: "Sun in Aries", baseInterpretation: "You lead with courage.", language }),
  ]);
  cases.push([
    `deepen.${language}.aspect`,
    () => buildDeepInterpretationPrompt({ chart: chartA, focusTopic: "Sun trine Mars", baseInterpretation: "Energy flows easily.", language }),
  ]);
  cases.push([`forecast.${language}`, () => buildForecastPrompt({ chart: chartA, today: "2026-10-18", language })]);
  for (const section of ["planets", "houses", "aspects", "portrait"] as const) {
    cases.push([
      `premiumPdf.${language}.${section}`,
      () => buildPremiumPdfNarrativeSectionPrompt({ profile, chart: chartA, language, sections: uiSections, section, isRelocated: false }),
    ]);
  }
  cases.push([
    `premiumPdf.${language}.unknownTime.relocated`,
    () => buildPremiumPdfNarrativeSectionPrompt({
      profile: { ...profile, birthTime: null, timeUnknown: true },
      chart: chartB,
      language,
      sections: [],
      section: "houses",
      isRelocated: true,
    }),
  ]);
  cases.push([
    `letterAnalysis.${language}.full`,
    () => buildLetterAnalysisPrompt({
      ...letterAnalysisBase,
      language,
      knownText: "Профессия: дизайнер",
      askedKeys: ["occupation", "Do you like travel?"],
      recentQuestion: "Will I move abroad?",
    }),
  ]);
  cases.push([
    `letterAnalysis.${language}.coldStart`,
    () => buildLetterAnalysisPrompt({ ...letterAnalysisBase, language, knownText: "", askedKeys: [], recentQuestion: null }),
  ]);
  for (const addressForm of ["feminine", "masculine", null]) {
    cases.push([
      `letterGeneration.${language}.${addressForm ?? "neutral"}`,
      () => buildLetterGenerationPrompt({ astrologerName: "Vega", language, addressForm, brief: { themes: ["career"], questions: [] } }),
    ]);
  }
  cases.push([
    `newsDigest.${language}`,
    () => buildNewsDigestPrompt({ interestTags: ["music", "travel"], residence: "Berlin, Germany", language, date: "2026-10-18" }),
  ]);
  cases.push([
    `newsDigest.${language}.noInterests`,
    () => buildNewsDigestPrompt({ interestTags: [], residence: "Berlin, Germany", language, date: "2026-10-18" }),
  ]);
}
cases.push(["factExtraction", () => buildFactExtractionPrompt({ text: "I am a designer and want to move to Spain with my kids." })]);
cases.push(["factExtraction.long", () => buildFactExtractionPrompt({ text: "x".repeat(2100) })]);

describe("prompt defaults (golden copy)", () => {
  it.each(cases)("%s", (_name, build) => {
    expect(snapshotOf(build())).toMatchSnapshot();
  });
});
