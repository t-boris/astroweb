import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { resolveOwnedChart } from "../services/chartResolver";
import {
  buildDeepInterpretationPrompt,
  generateGeminiText,
  getGeminiModelName,
  normalizeLanguage,
} from "../services/gemini";

export const deepenInterpretation = onCall(async (request) => {
  const profileId = request.data?.profileId;
  const ownerDeviceId = request.data?.ownerDeviceId;
  const focusTopic = request.data?.focusTopic;
  const baseInterpretation = request.data?.baseInterpretation;
  const language = normalizeLanguage(request.data?.language);
  const relocationLat = request.data?.relocationLat;
  const relocationLng = request.data?.relocationLng;

  if (!profileId || typeof profileId !== "string") {
    throw new HttpsError("invalid-argument", "profileId is required");
  }

  if (!ownerDeviceId || typeof ownerDeviceId !== "string") {
    throw new HttpsError("invalid-argument", "ownerDeviceId is required");
  }

  if (!focusTopic || typeof focusTopic !== "string") {
    throw new HttpsError("invalid-argument", "focusTopic is required");
  }

  if (!baseInterpretation || typeof baseInterpretation !== "string") {
    throw new HttpsError("invalid-argument", "baseInterpretation is required");
  }

  try {
    const { chart } = await resolveOwnedChart({
      profileId,
      ownerDeviceId,
      relocationLat,
      relocationLng,
    });

    const text = await generateGeminiText(
      buildDeepInterpretationPrompt({
        chart,
        focusTopic: focusTopic.trim().slice(0, 200),
        baseInterpretation: baseInterpretation.trim().slice(0, 2000),
        language,
      }),
      {
        allowContinuation: true,
        sanitizeOutput: true,
        requireEndTag: "[END_OF_REPORT]",
      },
    );

    return {
      text,
      model: getGeminiModelName(),
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }

    logger.error("deepenInterpretation failed", {
      profileId,
      error: (error as Error).message,
    });
    throw new HttpsError("internal", "Failed to generate deep interpretation");
  }
});
