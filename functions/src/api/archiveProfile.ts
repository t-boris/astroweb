import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import * as profileService from "../services/profile";
import { ownerCtx, ownsProfile } from "../services/owner";

/**
 * Archive / unarchive a profile (we never hard-delete). `archived` defaults to
 * true; pass false to restore.
 */
export const archiveProfile = onCall(async (request) => {
  const profileId = request.data?.profileId;
  const archived = request.data?.archived !== false;
  if (typeof profileId !== "string" || !profileId) {
    throw new HttpsError("invalid-argument", "profileId is required");
  }
  const ctx = ownerCtx(request);
  const profile = await profileService.getProfileById(profileId);
  if (!profile) {
    throw new HttpsError("not-found", "Profile not found");
  }
  if (!ownsProfile(profile, ctx)) {
    throw new HttpsError("permission-denied", "Access denied");
  }
  await getFirestore().collection("profiles").doc(profileId).update({ archived });
  return { ok: true, archived };
});
