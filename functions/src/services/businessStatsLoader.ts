import { getFirestore, Timestamp } from "firebase-admin/firestore";
import {
  computeBusinessStats,
  periodStart,
  type BusinessStats,
  type Grouping,
  type Period,
  type ProfileOwner,
  type PurchaseRow,
  type SpendRow,
} from "./businessStats";

const toDate = (v: unknown): Date | null => {
  const t = v as { toDate?: () => Date } | null | undefined;
  return t && typeof t.toDate === "function" ? t.toDate() : null;
};

/** Read the rows the Business tab needs from Firestore and aggregate them. */
export async function loadBusinessStats(period: Period, grouping: Grouping, now = new Date()): Promise<BusinessStats> {
  const db = getFirestore();
  const since = periodStart(period, now);
  const sinceTs = since ? Timestamp.fromDate(since) : null;

  let purchasesQ: FirebaseFirestore.Query = db.collection("purchases");
  let spendsQ: FirebaseFirestore.Query = db.collection("starSpends");
  let profilesQ: FirebaseFirestore.Query = db.collection("profiles");
  if (sinceTs) {
    purchasesQ = purchasesQ.where("createdAt", ">=", sinceTs);
    spendsQ = spendsQ.where("createdAt", ">=", sinceTs);
  }
  if (since) {
    // Profiles store createdAt as an ISO string.
    profilesQ = profilesQ.where("createdAt", ">=", since.toISOString());
  }

  const [purchasesSnap, spendsSnap, subsSnap, newProfilesAgg, firstSpendSnap] = await Promise.all([
    purchasesQ.get(),
    spendsQ.get(),
    db.collection("subscriptions").get(),
    profilesQ.count().get(),
    db.collection("starSpends").orderBy("createdAt", "asc").limit(1).get(),
  ]);

  const purchases: PurchaseRow[] = purchasesSnap.docs.map((d) => {
    const p = d.data();
    return {
      id: d.id,
      amountTotal: typeof p.amountTotal === "number" ? p.amountTotal : null,
      currency: typeof p.currency === "string" ? p.currency : null,
      createdAt: toDate(p.createdAt),
      livemode: typeof p.livemode === "boolean" ? p.livemode : null,
      ownerUid: typeof p.ownerUid === "string" ? p.ownerUid : null,
      ownerDeviceId: typeof p.ownerDeviceId === "string" ? p.ownerDeviceId : null,
      profileId: typeof p.profileId === "string" ? p.profileId : null,
    };
  });

  // Legacy purchases have no ownerUid: look up the owner on the profile.
  const needProfile = [...new Set(purchases.filter((p) => !p.ownerUid && p.profileId).map((p) => p.profileId as string))];
  const profiles = new Map<string, ProfileOwner>();
  for (let i = 0; i < needProfile.length; i += 100) {
    const refs = needProfile.slice(i, i + 100).map((id) => db.collection("profiles").doc(id));
    const docs = await db.getAll(...refs);
    for (const doc of docs) {
      if (!doc.exists) continue;
      const d = doc.data() ?? {};
      profiles.set(doc.id, {
        ownerUid: typeof d.ownerUid === "string" ? d.ownerUid : null,
        ownerDeviceId: typeof d.ownerDeviceId === "string" ? d.ownerDeviceId : null,
      });
    }
  }

  const spends: SpendRow[] = spendsSnap.docs.map((d) => {
    const s = d.data();
    return { feature: String(s.feature ?? "unknown"), stars: Number(s.stars) || 0, createdAt: toDate(s.createdAt) };
  });

  return computeBusinessStats({
    period,
    grouping,
    now,
    purchases,
    profiles,
    subscriptionStatuses: subsSnap.docs.map((d) => String(d.data().status ?? "")),
    newProfiles: newProfilesAgg.data().count,
    spends,
    firstSpendAt: firstSpendSnap.empty ? null : toDate(firstSpendSnap.docs[0].data().createdAt),
  });
}
