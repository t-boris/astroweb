import type { ChartResult } from "../types";
export type SupportedLanguage = "ru" | "en";
interface GeminiGenerateInput {
    systemInstruction: string;
    userPrompt: string;
    temperature?: number;
    maxOutputTokens?: number;
}
interface GeminiGenerateOptions {
    allowContinuation?: boolean;
    sanitizeOutput?: boolean;
    requireEndTag?: string;
}
export declare function normalizeLanguage(language: unknown): SupportedLanguage;
export declare function buildPlanetaryContext(chart: ChartResult): string;
export declare function buildDeepInterpretationPrompt(params: {
    chart: ChartResult;
    focusTopic: string;
    baseInterpretation: string;
    language: SupportedLanguage;
}): GeminiGenerateInput;
export declare function buildOraclePrompt(params: {
    chart: ChartResult;
    question: string;
    language: SupportedLanguage;
}): GeminiGenerateInput;
export declare function buildRelationshipPrompt(params: {
    chartA: ChartResult;
    chartB: ChartResult;
    personAName: string;
    personBName: string;
    language: SupportedLanguage;
}): GeminiGenerateInput;
export declare function generateGeminiText(input: GeminiGenerateInput, options?: GeminiGenerateOptions): Promise<string>;
export declare function getGeminiModelName(): string;
export {};
