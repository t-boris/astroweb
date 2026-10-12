import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { resolveOwnedChart } from "../services/chartResolver";
import {
  buildPlanetaryContext,
  generateClaudeTextResult,
  normalizeLanguage,
  withOutputLanguage,
} from "../services/anthropic";
import { hashCacheKey } from "../services/aiCache";

/**
 * Daily "cosmic weather" forecast for a profile's natal chart.
 * Free (no tokens) and cached per profile per day to avoid repeat AI cost.
 */
export const getForecast = onCall({
  timeoutSeconds: 120,
  secrets: ["ANTHROPIC_API_KEY"],
}, async (request) => {
  const profileId = request.data?.profileId;
  const ownerDeviceId = request.data?.ownerDeviceId;
  const language = normalizeLanguage(request.data?.language);

  if (typeof profileId !== "string" || !profileId) {
    throw new HttpsError("invalid-argument", "profileId is required");
  }
  if (typeof ownerDeviceId !== "string" || !ownerDeviceId) {
    throw new HttpsError("invalid-argument", "ownerDeviceId is required");
  }

  try {
    const { chart } = await resolveOwnedChart({ profileId, ownerDeviceId, uid: request.auth?.uid ?? null });
    const today = new Date().toISOString().slice(0, 10); // server date (YYYY-MM-DD)
    const cacheKey = hashCacheKey({ kind: "forecast", profileId, today, language });
    const db = getFirestore();
    const ref = db.collection("forecastCache").doc(cacheKey);

    const cached = await ref.get();
    if (cached.exists && cached.data()?.text) {
      return { text: cached.data()!.text, date: today, model: cached.data()!.model ?? "cache" };
    }

    const planetary = buildPlanetaryContext(chart);
    const system = language === "ru"
      ? "Ты астролог, описывающий «космическую погоду» дня. Опирайся только на натальную карту и текущую дату. Пиши тепло и понятно, без предсказаний конкретных событий, без медицинских/юридических/финансовых советов."
      : "You are an astrologer describing today's cosmic weather. Use only the natal chart and today's date. Write warmly and plainly, with no concrete event predictions and no medical/legal/financial advice.";
    const userPrompt = language === "ru"
      ? [
          `Сегодня ${today}. Натальная карта:`,
          planetary,
          "Дай краткий прогноз на сегодня в таком формате (используй ## для заголовков):",
          "## Настроение дня — короткая фраза",
          "1 абзац (2-3 предложения) об общем тоне дня для этого человека.",
          "## Что в фокусе",
          "3 коротких пункта-маркера (-) с конкретными темами дня (энергия, общение, отношения, отдых и т.п.).",
          "Объем 120-200 слов. Заверши строкой: [END_OF_REPORT]",
        ].join("\n\n")
      : [
          `Today is ${today}. Natal chart:`,
          planetary,
          "Give a short forecast for today in this format (use ## for headings):",
          "## Today's vibe — a short phrase",
          "1 paragraph (2-3 sentences) about the overall tone of the day for this person.",
          "## In focus",
          "3 short bullet points (-) with concrete themes for the day (energy, communication, relationships, rest, etc.).",
          "120-200 words. End with the line: [END_OF_REPORT]",
        ].join("\n\n");

    const result = await generateClaudeTextResult(
      withOutputLanguage({ systemInstruction: system, userPrompt, temperature: 0.5, maxOutputTokens: 1200 }, language),
      { allowContinuation: true, sanitizeOutput: true, requireEndTag: "[END_OF_REPORT]" },
    );

    await ref.set({
      text: result.text,
      model: result.model,
      profileId,
      date: today,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { text: result.text, date: today, model: result.model };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error("getForecast failed", { profileId, error: (error as Error).message });
    throw new HttpsError("internal", "Failed to generate forecast");
  }
});
