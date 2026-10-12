import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";
import { generateLetter, persistLetter } from "../services/letterEngine";
import { advance } from "../services/astrologer";
import { grantToWallet, walletKeyFromProfile } from "../services/wallet";
import { getProfileById } from "../services/profile";
import { sendLetterNotifications } from "../services/letterNotify";

/**
 * Letter generation worker. Triggered by a `letterJobs/{jobId}` doc created by
 * the scheduler. On success: persist letter, credit +1 ✦, advance the
 * subscription schedule. On failure: mark failed — NO star credit, NO schedule
 * advance (a future sweep can retry).
 */
export const processLetterJob = onDocumentCreated(
  { document: "letterJobs/{jobId}", timeoutSeconds: 300, secrets: ["ANTHROPIC_API_KEY", "VAPID_PRIVATE_KEY", "RESEND_API_KEY"] },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data() as {
      profileId: string;
      ownerUid: string;
      cadence: string;
      windowStart: string;
      windowEnd: string;
      status: string;
      attempts?: number;
    };
    if (data.status !== "queued") return;
    const { profileId, ownerUid, cadence, windowStart, windowEnd } = data;
    const db = getFirestore();

    await snap.ref.update({ status: "running", attempts: (data.attempts ?? 0) + 1 });
    try {
      const content = await generateLetter(profileId);
      const letterId = await persistLetter(profileId, ownerUid, content, { cadence, windowStart, windowEnd });

      // Credit +1 ✦ to the wallet (subscription perk) on successful delivery.
      try {
        const profile = await getProfileById(profileId);
        const key = profile && walletKeyFromProfile(profile);
        if (key) await grantToWallet(key, 1);
      } catch (e) {
        logger.warn("processLetterJob star credit failed", { profileId, error: (e as Error).message });
      }

      // Advance the subscription schedule (success only) + email teaser.
      const subRef = db.collection("subscriptions").doc(profileId);
      const subSnap = await subRef.get();
      if (subSnap.exists) {
        const sub = subSnap.data() as {
          nextLetterAt?: string;
          channels?: { email?: boolean };
          recipientEmails?: string[];
          astrologerName?: string;
        };
        const next = advance(sub.nextLetterAt ?? windowEnd, cadence);
        await subRef.update({ nextLetterAt: next, updatedAt: new Date().toISOString() });

        // Out-of-app notifications: web push + full beautifully-formatted email.
        await sendLetterNotifications({
          profileId,
          ownerUid,
          teaserText: content.teaserText,
          html: content.html,
          dateLabel: new Intl.DateTimeFormat(content.language === "ru" ? "ru-RU" : "en-US", { dateStyle: "long" }).format(new Date(content.generatedAt)),
          astrologerName: sub.astrologerName,
          sub,
        });
      }

      await snap.ref.update({
        status: "completed",
        letterId,
        costUsd: content.cost.usd,
        completedAt: new Date().toISOString(),
      });
      logger.info("processLetterJob completed", { profileId, letterId, usd: content.cost.usd.toFixed(4) });
    } catch (err) {
      logger.error("processLetterJob failed", { profileId, error: (err as Error).message });
      await snap.ref.update({ status: "failed", error: (err as Error).message });
    }
  },
);
