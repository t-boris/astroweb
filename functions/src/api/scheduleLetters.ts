import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { enqueueDueLetters } from "../services/letterScheduling";

/**
 * Every 15 minutes: close the subscriptions whose cancel has taken effect and enqueue the letters that are due
 * (see `enqueueDueLetters`).
 */
export const scheduleLetters = onSchedule("every 15 minutes", async () => {
  const { due, enqueued, closed } = await enqueueDueLetters();
  if (due === 0 && closed === 0) return;
  logger.info("scheduleLetters", { due, enqueued, closed });
});
