import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import type { AppLanguage } from "@/lib/language";
import type { ChartPortraitResult, ChartReadingResult } from "@/types";

/** The server gives a reading and a story up to 300 s each; the page waits a little longer so no answer is lost. */
const TIMEOUT_MS = 310_000;

/** Read a chart picture (a data URL): 1 star, free for a picture read before, refunded when no birth comes out. */
export async function readChartImage(image: string): Promise<ChartReadingResult> {
  const fn = httpsCallable<{ image: string }, ChartReadingResult>(functions, "readChartImage", { timeout: TIMEOUT_MS });
  return (await fn({ image })).data;
}

/** The story about the person of a reading, once per language, covered by the star of the reading. */
export async function describeChartReading(
  readingId: string,
  language: AppLanguage,
  placeName: string | null,
): Promise<ChartPortraitResult> {
  const fn = httpsCallable<{ readingId: string; language: AppLanguage; placeName?: string }, ChartPortraitResult>(
    functions,
    "describeChartReading",
    { timeout: TIMEOUT_MS },
  );
  return (await fn({ readingId, language, ...(placeName ? { placeName } : {}) })).data;
}
