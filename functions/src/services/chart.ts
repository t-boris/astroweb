import { getFirestore } from "firebase-admin/firestore";
import { createHash } from "crypto";
import { ChartDocument, ChartResult } from "../types/index";

/**
 * Chart Firestore service — stores and retrieves computed natal charts
 * with SHA-256 inputHash-based cache lookup.
 *
 * Follows the same patterns as services/profile.ts:
 * - getFirestore() called lazily (not at module level)
 * - ISO string timestamps (not Firestore Timestamp)
 * - doc.id included in returned objects
 */

const COLLECTION_NAME = "charts";

function getCollection() {
  return getFirestore().collection(COLLECTION_NAME);
}

/**
 * Compute a deterministic SHA-256 hash of chart computation inputs.
 * Used for cache lookup — same inputs always produce the same hash.
 */
export function computeInputHash(inputs: {
  birthDate: string;
  birthTime: string | null;
  lat: number;
  lng: number;
  timezone: string;
  houseSystem: string;
}): string {
  const canonical = [
    inputs.birthDate,
    inputs.birthTime ?? "NULL",
    inputs.lat.toFixed(6),
    inputs.lng.toFixed(6),
    inputs.timezone,
    inputs.houseSystem,
  ].join("|");

  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Find a cached chart by profileId and inputHash.
 * Returns the chart document if found, null otherwise.
 */
export async function findCachedChart(
  profileId: string,
  inputHash: string
): Promise<ChartDocument | null> {
  const snapshot = await getCollection()
    .where("profileId", "==", profileId)
    .where("inputHash", "==", inputHash)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  const data = doc.data() as Omit<ChartDocument, "id">;
  return {
    id: doc.id,
    ...data,
  };
}

/**
 * Store a newly computed chart in Firestore.
 * Returns the full ChartDocument including the generated id.
 */
export async function storeChart(
  profileId: string,
  inputHash: string,
  result: ChartResult
): Promise<ChartDocument> {
  const chartData = {
    profileId,
    type: "natal" as const,
    computedAt: new Date().toISOString(),
    inputHash,
    result,
  };

  const docRef = await getCollection().add(chartData);

  return {
    id: docRef.id,
    ...chartData,
  };
}

/**
 * Get the most recent chart for a profile.
 * Returns the chart document or null if none exists.
 */
export async function getChartByProfileId(
  profileId: string
): Promise<ChartDocument | null> {
  const snapshot = await getCollection()
    .where("profileId", "==", profileId)
    .orderBy("computedAt", "desc")
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  const data = doc.data() as Omit<ChartDocument, "id">;
  return {
    id: doc.id,
    ...data,
  };
}

/**
 * Delete all charts for a profile (batch delete).
 * Useful for cleanup when a profile is deleted.
 * Idempotent — no error if no charts exist.
 */
export async function deleteChartsByProfileId(
  profileId: string
): Promise<void> {
  const snapshot = await getCollection()
    .where("profileId", "==", profileId)
    .get();

  if (snapshot.empty) {
    return;
  }

  const db = getFirestore();
  const batch = db.batch();
  for (const doc of snapshot.docs) {
    batch.delete(doc.ref);
  }
  await batch.commit();
}
