/** The fields of a `subscriptions/{profileId}` document that decide whether a cancel has taken effect. */
export interface LifecycleDoc {
  canceledAt?: string | null;
  currentPeriodEnd?: string | null;
}

/**
 * A cancel is "at period end": the letters already paid for keep coming until the period is over, and after
 * that the subscription is over. The payment provider's "deleted" event is what normally flips the record to
 * status "canceled", but the record must not depend on it alone: a letter is a paid generation and an email,
 * so a cancel the owner made long ago has to stop them even when that event never reached us.
 *
 * The stored period end is not refreshed by every renewal, so one that is missing, unreadable or already past
 * counts as over: the owner's cancel wins over a stale date.
 */
export function cancellationTookEffect(doc: LifecycleDoc, now: Date): boolean {
  if (!doc.canceledAt) return false;
  const periodEnd = Date.parse(doc.currentPeriodEnd ?? "");
  return !(periodEnd > now.getTime());
}
