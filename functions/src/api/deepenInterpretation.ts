import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { resolveOwnedChart } from "../services/chartResolver";
import * as profileService from "../services/profile";
import { hashCacheKey } from "../services/aiCache";
import { ownerCtx, ownsProfile } from "../services/owner";
import { saveDeepText } from "../services/profileContent";
import {
  buildDeepInterpretationPrompt,
  generateClaudeTextResult,
  normalizeLanguage,
} from "../services/anthropic";

export const deepenInterpretation = onCall({
  timeoutSeconds: 180,
  secrets: ["ANTHROPIC_API_KEY"],
}, async (request) => {
  const profileId = request.data?.profileId;
  const ownerDeviceId = request.data?.ownerDeviceId;
  const focusTopic = request.data?.focusTopic;
  const baseInterpretation = request.data?.baseInterpretation;
  const language = normalizeLanguage(request.data?.language);
  const relocationLat = request.data?.relocationLat;
  const relocationLng = request.data?.relocationLng;
  // Interpretation block the text belongs to (used to store it per block).
  const rawBlockKey = request.data?.blockKey;
  const blockKey = typeof rawBlockKey === "string" && rawBlockKey.trim() && rawBlockKey.length <= 200 ? rawBlockKey.trim() : null;

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

  const trimmedFocus = focusTopic.trim().slice(0, 200);
  const trimmedBase = baseInterpretation.trim().slice(0, 2000);

  try {
    // Ownership check (cheap) before any generation or cache read.
    const ctx = ownerCtx(request);
    const profile = await profileService.getProfileById(profileId);
    if (!profile) {
      throw new HttpsError("not-found", "Profile not found");
    }
    if (!ownsProfile(profile, ctx)) {
      throw new HttpsError("permission-denied", "Access denied");
    }

    const cacheKey = hashCacheKey({
      kind: "deepen",
      profileId,
      birthDate: profile.birthDate,
      birthTime: profile.birthTime ?? null,
      timeUnknown: profile.timeUnknown,
      lat: profile.lat,
      lng: profile.lng,
      timezone: profile.timezone,
      relocationLat: typeof relocationLat === "number" ? relocationLat : null,
      relocationLng: typeof relocationLng === "number" ? relocationLng : null,
      language,
      focusTopic: trimmedFocus,
      baseInterpretation: trimmedBase,
    });

    // REQ-003: a signed-in owner's deep text is stored per block for every
    // device of the account. Anonymous owners keep it in the browser (DEC-004).
    const persist = async (text: string, model: string): Promise<boolean> => {
      if (!blockKey || !ctx.uid || profile.ownerUid !== ctx.uid) return false;
      try {
        await saveDeepText(profileId, { blockKey, text, language, model });
        return true;
      } catch (e) {
        logger.warn("deepenInterpretation text write failed", { profileId, error: (e as Error).message });
        return false;
      }
    };

    const db = getFirestore();
    const cacheRef = db.collection("deepInterpretationCache").doc(cacheKey);

    // Cache hit: never regenerate — return the stored text (no Claude tokens spent).
    const cached = await cacheRef.get();
    if (cached.exists) {
      const data = cached.data() as { text?: string; model?: string };
      if (data.text) {
        logger.info("deepenInterpretation cache hit", { profileId, cacheKey });
        const persisted = await persist(data.text, data.model ?? "cache");
        return { text: data.text, model: data.model ?? "cache", persisted };
      }
    }

    // Dig Deeper is included in the one-time Interpretations + PDF unlock —
    // not charged per call. Requires that unlock; each block generates once
    // (cache hit above returns the stored answer).
    if (!profile.hasPremiumPdf) {
      throw new HttpsError("permission-denied", "PREMIUM_REQUIRED");
    }

    const { chart } = await resolveOwnedChart({
      profileId,
      ownerDeviceId,
      uid: ctx.uid,
      relocationLat,
      relocationLng,
    });

    const result = await generateClaudeTextResult(
      buildDeepInterpretationPrompt({
        chart,
        focusTopic: trimmedFocus,
        baseInterpretation: trimmedBase,
        language,
      }),
      {
        allowContinuation: true,
        sanitizeOutput: true,
        requireEndTag: "[END_OF_REPORT]",
      },
    );

    await cacheRef.set({
      text: result.text,
      model: result.model,
      profileId,
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      text: result.text,
      model: result.model,
      persisted: await persist(result.text, result.model),
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
