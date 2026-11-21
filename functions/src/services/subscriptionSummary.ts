import { getFirestore } from "firebase-admin/firestore";
import type { Profile, ProfileSubscription } from "../types";

/** The fields of a `subscriptions/{profileId}` document the profile list needs. */
export interface SubscriptionDoc {
  status?: string;
  cadence?: string;
  canceledAt?: string | null;
  currentPeriodEnd?: string | null;
}

/** Reads the subscription documents of the given profile ids; a profile without one is simply absent. */
export type SubscriptionLoader = (profileIds: string[]) => Promise<Map<string, SubscriptionDoc>>;

/**
 * The state the profile list shows for one subscription record, or null when there is nothing to show.
 * A cancel is "at period end": access (and the letters already paid for) stay until then, so a cancelled
 * record whose period has not ended is "ending", and one whose period has ended is gone.
 */
export function summarizeSubscription(doc: SubscriptionDoc | undefined, now: Date): ProfileSubscription | null {
  if (!doc) return null;
  const cadence = typeof doc.cadence === "string" ? doc.cadence : "";
  const until = typeof doc.currentPeriodEnd === "string" && doc.currentPeriodEnd ? doc.currentPeriodEnd : null;
  const periodOpen = until !== null && Date.parse(until) > now.getTime();

  switch (doc.status) {
    case "active":
      if (!doc.canceledAt) return { state: "active", cadence, until };
      return periodOpen ? { state: "ending", cadence, until } : null;
    case "paused":
      return { state: "paused", cadence, until };
    case "past_due":
      return { state: "past_due", cadence, until };
    default:
      return null;
  }
}

/** Firestore `getAll` takes any number of references; the chunks keep one request reasonably small. */
const CHUNK = 100;

export const loadSubscriptionDocs: SubscriptionLoader = async (profileIds) => {
  const db = getFirestore();
  const found = new Map<string, SubscriptionDoc>();
  for (let i = 0; i < profileIds.length; i += CHUNK) {
    const refs = profileIds.slice(i, i + CHUNK).map((id) => db.collection("subscriptions").doc(id));
    const snaps = await db.getAll(...refs);
    for (const snap of snaps) if (snap.exists) found.set(snap.id, snap.data() as SubscriptionDoc);
  }
  return found;
};

/**
 * The profiles with their subscription summary, one read for the whole list. The summary is a nice-to-have:
 * when the read fails the profiles are returned as they are, so a billing hiccup never empties the list.
 */
export async function withSubscriptions(
  profiles: Profile[],
  load: SubscriptionLoader,
  now: Date = new Date(),
  onError: (error: Error) => void = () => {},
): Promise<Profile[]> {
  if (profiles.length === 0) return profiles;
  let docs: Map<string, SubscriptionDoc>;
  try {
    docs = await load(profiles.map((p) => p.id));
  } catch (error) {
    onError(error as Error);
    return profiles;
  }
  return profiles.map((profile) => {
    const subscription = summarizeSubscription(docs.get(profile.id), now);
    return subscription ? { ...profile, subscription } : profile;
  });
}
