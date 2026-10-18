import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import * as profileService from "../services/profile";
import { ownsProfile } from "../services/owner";
import { requireUid, isAstrologerEnabled } from "../services/astrologer";
import { generateLetter, persistLetter, todaysLetterId } from "../services/letterEngine";
import { sendLetterNotifications } from "../services/letterNotify";
import { AI_SECRETS } from "../services/ai/keys";

/**
 * Internal/testing + sample-letter trigger: synchronously generate one letter
 * for a chart and persist it. Gated by the feature flag (allow-listed uids)
 * during Phases 2-3; opened to the sample-letter funnel in Phase 6.
 * Fires the same out-of-app notifications (push + email) as a scheduled letter
 * so a test letter exercises the whole pipeline.
 */
export const generateLetterNow = onCall(
  { timeoutSeconds: 180, secrets: [...AI_SECRETS, "VAPID_PRIVATE_KEY", "RESEND_API_KEY"] },
  async (request) => {
    const uid = requireUid(request);
    if (!(await isAstrologerEnabled(uid))) {
      throw new HttpsError("permission-denied", "Personal Astrologer is not enabled for this account yet");
    }
    const profileId = request.data?.profileId;
    if (typeof profileId !== "string" || !profileId) {
      throw new HttpsError("invalid-argument", "profileId is required");
    }
    const profile = await profileService.getProfileById(profileId);
    if (!profile) throw new HttpsError("not-found", "Profile not found");
    if (!ownsProfile(profile, { uid, deviceId: null })) {
      throw new HttpsError("permission-denied", "Access denied");
    }

    // Idempotent: don't regenerate (and re-charge COGS) if a letter already
    // exists for today — return it instead.
    const existing = await todaysLetterId(profileId);
    if (existing) {
      return { ok: true, letterId: existing, costUsd: 0, reused: true };
    }

    try {
      const content = await generateLetter(profileId);
      const now = new Date().toISOString();
      const letterId = await persistLetter(profileId, uid, content, {
        cadence: "manual",
        windowStart: now,
        windowEnd: now,
      });

      // Notify exactly like a scheduled letter (push now; email once RESEND is
      // configured). Best-effort — never fails the generation.
      await sendLetterNotifications({
        profileId,
        ownerUid: uid,
        teaserText: content.teaserText,
        html: content.html,
        dateLabel: new Intl.DateTimeFormat(content.language === "ru" ? "ru-RU" : "en-US", { dateStyle: "long" }).format(new Date(content.generatedAt)),
      });

      return { ok: true, letterId, costUsd: content.cost.usd };
    } catch (err) {
      logger.error("generateLetterNow failed", { profileId, error: (err as Error).message });
      throw new HttpsError("internal", "Failed to generate letter");
    }
  },
);
