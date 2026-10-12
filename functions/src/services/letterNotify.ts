import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { logger } from "firebase-functions/v2";
import { sendLetterTeaserEmail } from "./email";
import { sendPushToUser } from "./webpush";

interface SubLite {
  channels?: { email?: boolean };
  recipientEmails?: string[];
  astrologerName?: string;
}

/**
 * Deliver a letter's out-of-app notifications: a web push to the owner's
 * registered browsers, plus an email teaser to the subscription's recipients
 * (or the account email when none are set). Shared by the scheduled worker
 * (processLetterJob) and the manual/sample trigger (generateLetterNow) so a
 * test letter notifies exactly like a real one. Every channel is best-effort
 * and no-ops cleanly when its secret/registration is missing.
 */
export async function sendLetterNotifications(params: {
  profileId: string;
  ownerUid: string | null | undefined;
  teaserText: string;
  astrologerName?: string;
  /** Full letter body HTML — emailed in full when present. */
  html?: string;
  /** Localized date label shown in the email header. */
  dateLabel?: string;
  /** Pass the already-loaded subscription to avoid a re-read; omit to load it. */
  sub?: SubLite | null;
}): Promise<void> {
  const { profileId, ownerUid, teaserText } = params;

  // Web push — best-effort; no-op if the user hasn't registered a browser.
  if (ownerUid) {
    try {
      await sendPushToUser(ownerUid, {
        title: "✦ A letter from your astrologer",
        body: teaserText || "Your astrologer wrote to you.",
        url: `/profile/${profileId}/letters`,
        tag: "astrologer-letter",
      });
    } catch (e) {
      logger.warn("sendLetterNotifications push failed", { profileId, error: (e as Error).message });
    }
  }

  // Email teaser. Load the subscription if not provided. For a sample letter
  // with no subscription, default email ON and use the account email.
  let sub = params.sub;
  if (sub === undefined) {
    const snap = await getFirestore().collection("subscriptions").doc(profileId).get();
    sub = snap.exists ? (snap.data() as SubLite) : null;
  }

  const emailEnabled = sub ? sub.channels?.email !== false : true;
  if (!emailEnabled || !ownerUid) return;

  let recipients = Array.isArray(sub?.recipientEmails) ? sub!.recipientEmails! : [];
  if (recipients.length === 0) {
    try {
      const accountEmail = (await getAuth().getUser(ownerUid)).email;
      if (accountEmail) recipients = [accountEmail];
    } catch (e) {
      logger.warn("sendLetterNotifications account email lookup failed", { profileId, error: (e as Error).message });
    }
  }

  const astrologerName = params.astrologerName ?? sub?.astrologerName ?? "Vega";
  for (const to of recipients) {
    try {
      await sendLetterTeaserEmail({
        toEmail: to,
        astrologerName,
        teaser: teaserText,
        html: params.html,
        dateLabel: params.dateLabel,
        appUrl: `https://natalmystic.com/profile/${profileId}/letters`,
      });
    } catch (e) {
      logger.warn("sendLetterNotifications email failed", { profileId, to, error: (e as Error).message });
    }
  }
}
