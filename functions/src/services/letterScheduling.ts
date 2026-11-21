import { logger } from "firebase-functions/v2";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { cancellationTookEffect, type LifecycleDoc } from "./subscriptionLifecycle";

/** What one scheduler tick did. */
export interface ScheduleResult {
  due: number;
  enqueued: number;
  /** Subscriptions whose cancel has taken effect: closed instead of getting another letter (due or not). */
  closed: number;
}

/**
 * Closes the subscriptions whose cancel has taken effect (cancelled, and the paid period is over) but that are
 * still marked active, whether or not a letter is due: the profile card, the account page and the profile list all
 * read the status, so one that stays "active" for days after the cancel shows a subscription that is over.
 * Status "canceled" is what the payment provider's own event would set.
 *
 * Returns the number closed. Needs the (status, canceledAt) index; the due-letter pass below checks the same rule,
 * so letters stay correct even while that index is still building.
 */
async function closeEndedCancellations(db: Firestore, now: Date): Promise<number> {
  const nowISO = now.toISOString();
  // `canceledAt > ""` matches every cancelled record (an ISO string) and none of the never-cancelled ones (null).
  const cancelled = await db
    .collection("subscriptions")
    .where("status", "==", "active")
    .where("canceledAt", ">", "")
    .limit(200)
    .get();

  let closed = 0;
  for (const doc of cancelled.docs) {
    if (!cancellationTookEffect(doc.data() as LifecycleDoc, now)) continue;
    try {
      await doc.ref.update({ status: "canceled", updatedAt: nowISO });
      closed += 1;
    } catch (e) {
      logger.warn("scheduleLetters could not close a cancelled subscription", { profileId: doc.id, error: (e as Error).message });
    }
  }
  return closed;
}

/**
 * One scheduler tick: close the cancelled subscriptions whose paid period is over, then find the active
 * subscriptions whose next letter is due and enqueue an idempotent `letterJobs/{profileId__windowStartISO}` doc.
 * The deterministic id prevents duplicate jobs across ticks while a job is running; `nextLetterAt` is only
 * advanced by `processLetterJob` on success.
 *
 * A subscription whose cancel has taken effect never gets a letter, even if the closing pass could not run.
 */
export async function enqueueDueLetters(now: Date = new Date()): Promise<ScheduleResult> {
  const db = getFirestore();
  const nowISO = now.toISOString();

  let swept = 0;
  try {
    swept = await closeEndedCancellations(db, now);
  } catch (e) {
    // Letters must not wait for the sweep (for example while its index is still being built).
    logger.warn("scheduleLetters could not look for ended cancellations", { error: (e as Error).message });
  }
  const due = await db
    .collection("subscriptions")
    .where("status", "==", "active")
    .where("nextLetterAt", "<=", nowISO)
    .limit(200)
    .get();

  const result: ScheduleResult = { due: due.docs.length, enqueued: 0, closed: swept };
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
