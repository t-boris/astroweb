import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";
import { cancellationTookEffect } from "./subscriptionLifecycle";

/** What one scheduler tick did. */
export interface ScheduleResult {
  due: number;
  enqueued: number;
  /** Subscriptions whose cancel has taken effect: closed instead of getting another letter. */
  closed: number;
}

/**
 * One scheduler tick: find active subscriptions whose next letter is due and enqueue an idempotent
 * `letterJobs/{profileId__windowStartISO}` doc. The deterministic id prevents duplicate jobs across ticks while a
 * job is running; `nextLetterAt` is only advanced by `processLetterJob` on success.
 *
 * A subscription whose cancel has taken effect (cancelled, and its paid period is over) gets no letter: it is
 * closed (status "canceled", as the payment provider's own event would do) so it stops being picked up.
 */
export async function enqueueDueLetters(now: Date = new Date()): Promise<ScheduleResult> {
  const db = getFirestore();
  const nowISO = now.toISOString();
  const due = await db
    .collection("subscriptions")
    .where("status", "==", "active")
    .where("nextLetterAt", "<=", nowISO)
    .limit(200)
    .get();

  const result: ScheduleResult = { due: due.docs.length, enqueued: 0, closed: 0 };
  if (due.empty) return result;

  for (const doc of due.docs) {
    const sub = doc.data() as {
      ownerUid: string;
      cadence: string;
      nextLetterAt: string;
      canceledAt?: string | null;
      currentPeriodEnd?: string | null;
    };

    if (cancellationTookEffect(sub, now)) {
      try {
        await doc.ref.update({ status: "canceled", updatedAt: nowISO });
        result.closed += 1;
      } catch (e) {
        logger.warn("scheduleLetters could not close a cancelled subscription", { profileId: doc.id, error: (e as Error).message });
      }
      continue;
    }

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
      result.enqueued += 1;
    } catch {
      // create() throws if the job already exists — that's the idempotency guard.
    }
  }
  return result;
}
