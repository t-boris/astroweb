import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { getProfileById } from "../services/profile";
import { ownerCtx, ownsProfile, requireAccount } from "../services/owner";
import {
  deleteContentItem,
  importLocalContent,
  readProfileContent,
  sanitizeUploadPayload,
} from "../services/profileContent";

function requireProfileId(data: unknown): string {
  const id = (data as { profileId?: unknown } | undefined)?.profileId;
  if (typeof id !== "string" || !id.trim()) {
    throw new HttpsError("invalid-argument", "profileId is required");
  }
  return id.trim();
}

/**
 * Everything stored for a profile (deep texts, compatibility readings, Oracle
 * history). Owner only, under the existing ownership rules: an account must own
 * the profile, and a device only while the profile has not been claimed.
 */
export const getProfileContent = onCall(async (request) => {
  const profileId = requireProfileId(request.data);
  const ctx = ownerCtx(request);
  const profile = await getProfileById(profileId);
  if (!profile) throw new HttpsError("not-found", "Profile not found");
  if (!ownsProfile(profile, ctx)) throw new HttpsError("permission-denied", "Access denied");
  return readProfileContent(profileId);
}) ;

/**
 * One-time upload of content that existed only in a browser (DEC-002, DEC-004).
 * Account authentication only: a deviceId-only caller is rejected, and the
 * profile must already be claimed by that account. Never touches stars or
 * unlock flags.
 */
export const uploadLocalContent = onCall(async (request) => {
  const uid = requireAccount(request);
  const profileId = requireProfileId(request.data);
  const profile = await getProfileById(profileId);
  if (!profile) throw new HttpsError("not-found", "Profile not found");
  if (!profile.ownerUid) {
    throw new HttpsError("failed-precondition", "Profile is not linked to an account yet");
  }
  if (profile.ownerUid !== uid) throw new HttpsError("permission-denied", "Access denied");

  const payload = sanitizeUploadPayload(request.data);
  const result = await importLocalContent(profileId, payload);
  logger.info("uploadLocalContent", { profileId, ...result });
  return result;
});

/** DEC-008: delete one Oracle entry or one compatibility reading (owner only). */
export const deleteProfileContentItem = onCall(async (request) => {
  const profileId = requireProfileId(request.data);
  const kind = request.data?.kind;
  const id = request.data?.id;
  if (kind !== "oracle" && kind !== "compatibility") {
    throw new HttpsError("invalid-argument", "kind must be oracle or compatibility");
  }
  if (typeof id !== "string" || !id.trim() || id.length > 200 || id.includes("/")) {
    throw new HttpsError("invalid-argument", "id is invalid");
  }
  const ctx = ownerCtx(request);
  const profile = await getProfileById(profileId);
  if (!profile) throw new HttpsError("not-found", "Profile not found");
  if (!ownsProfile(profile, ctx)) throw new HttpsError("permission-denied", "Access denied");
  const deleted = await deleteContentItem(profileId, kind, id.trim());
  return { deleted };
});
