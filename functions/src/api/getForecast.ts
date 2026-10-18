import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { resolveOwnedChart } from "../services/chartResolver";
import {
  buildForecastPrompt,
  generateClaudeTextResult,
  normalizeLanguage,
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

    const result = await generateClaudeTextResult(
      buildForecastPrompt({ chart, today, language }),
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
