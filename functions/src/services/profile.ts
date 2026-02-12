import { getFirestore } from "firebase-admin/firestore";
import { Profile, CreateProfilePayload } from "../types/index";

/**
 * Profile Firestore service — thin wrapper around Firestore admin SDK
 * operations for the profiles collection.
 *
 * Do NOT call initializeApp() here — it's called once in index.ts.
 */

const COLLECTION_NAME = "profiles";

function getCollection() {
  return getFirestore().collection(COLLECTION_NAME);
}

/**
 * Create a new profile document with auto-generated ID.
 * Sets createdAt and updatedAt to current ISO timestamp.
 */
export async function createProfile(
  payload: CreateProfilePayload
): Promise<Profile> {
  const now = new Date().toISOString();
  const profileData = {
    ownerDeviceId: payload.ownerDeviceId,
    name: payload.name,
    birthDate: payload.birthDate,
    birthTime: payload.birthTime,
    timeUnknown: payload.timeUnknown,
    birthPlace: payload.birthPlace,
    lat: payload.lat,
    lng: payload.lng,
    timezone: payload.timezone,
    createdAt: now,
    updatedAt: now,
  };

  const docRef = await getCollection().add(profileData);

  return {
    id: docRef.id,
    ...profileData,
  };
}

/**
 * Fetch a profile by document ID.
 * Returns Profile or null if not found.
 */
export async function getProfileById(id: string): Promise<Profile | null> {
  const doc = await getCollection().doc(id).get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data() as Omit<Profile, "id">;
  return {
    id: doc.id,
    ...data,
  };
}

/**
 * Query profiles owned by a specific device.
 * Returns array ordered by createdAt descending (newest first).
 */
export async function listProfilesByOwner(
  ownerDeviceId: string
): Promise<Profile[]> {
  const snapshot = await getCollection()
    .where("ownerDeviceId", "==", ownerDeviceId)
    .orderBy("createdAt", "desc")
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data() as Omit<Profile, "id">;
    return {
      id: doc.id,
      ...data,
    };
  });
}

/**
 * Update only provided fields on a profile document.
 * Always sets updatedAt to current timestamp.
 * Throws if document doesn't exist.
 */
export async function updateProfile(
  id: string,
  updates: Partial<Omit<Profile, "id" | "ownerDeviceId" | "createdAt">>
): Promise<Profile> {
  const docRef = getCollection().doc(id);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new Error(`Profile with id "${id}" not found`);
  }

  const updateData = {
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await docRef.update(updateData);

  // Re-fetch to return the full updated Profile
  const updated = await docRef.get();
  const data = updated.data() as Omit<Profile, "id">;
  return {
    id: updated.id,
    ...data,
  };
}

/**
 * Delete a profile document by ID.
 * Idempotent — no error if already deleted.
 */
export async function deleteProfile(id: string): Promise<void> {
  await getCollection().doc(id).delete();
}
