/**
 * Dates on the subscription cards, in the language of the interface. `Date.prototype.toLocaleString()` without a
 * language follows the browser's own setting, so a Russian page printed "11/21/2026, 3:00:35 PM" and "7/3/2026",
 * which reads as 7 March to a Russian reader and is a July date in the American order.
 */

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "21 Nov 2026" / "21 нояб. 2026 г.": the day only. Empty when the value is missing or not a date. */
export function formatDay(iso: string | null | undefined, language: string): string {
  const date = toDate(iso);
  if (!date) return "";
  try {
    return new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(date);
  } catch {
    return date.toDateString();
  }
}

/** The day and the time without seconds: "21 Nov 2026, 3:00 PM" / "21 нояб. 2026 г., 15:00". */
export function formatDayTime(iso: string | null | undefined, language: string): string {
  const date = toDate(iso);
  if (!date) return "";
  try {
    return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(date);
  } catch {
    return date.toString();
  }
}

/**
 * The end of the paid period, as a day, only while it is still ahead. The stored value is not refreshed by every
 * renewal, so one that is missing, unreadable (the epoch of a failed read included) or already past would announce
 * a cancellation that happened long ago: it is left out and the card says only that the subscription ends.
 */
export function formatPeriodEnd(iso: string | null | undefined, language: string, now: number = Date.now()): string {
  const date = toDate(iso);
  if (!date || date.getTime() <= now) return "";
  return formatDay(iso, language);
}
