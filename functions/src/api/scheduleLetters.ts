import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Every 15 minutes: find active subscriptions whose next letter is due and
 * enqueue an idempotent `letterJobs/{profileId__windowStartISO}` doc. The
 * deterministic id prevents duplicate jobs across ticks while a job is running;
 * `nextLetterAt` is only advanced by `processLetterJob` on success.
 */
export const scheduleLetters = onSchedule("every 15 minutes", async () => {
  const db = getFirestore();
  const nowISO = new Date().toISOString();
  const due = await db
    .collection("subscriptions")
    .where("status", "==", "active")
    .where("nextLetterAt", "<=", nowISO)
    .limit(200)
    .get();

  if (due.empty) return;
  let enqueued = 0;
  for (const doc of due.docs) {
    const sub = doc.data() as { ownerUid: string; cadence: string; nextLetterAt: string };
    const windowStart = sub.nextLetterAt;
    const jobId = `${doc.id}__${windowStart.replace(/[:.]/g, "-")}`;
    try {
      await db
        .collection("letterJobs")
        .doc(jobId)
        .create({
          profileId: doc.id,
          ownerUid: sub.ownerUid,
          cadence: sub.cadence,
          windowStart,
          windowEnd: nowISO,
          status: "queued",
          attempts: 0,
          createdAt: nowISO,
        });
      enqueued += 1;
    } catch {
      // create() throws if the job already exists — that's the idempotency guard.
    }
  }
  logger.info("scheduleLetters", { due: due.size, enqueued });
});
