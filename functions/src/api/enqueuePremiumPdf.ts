import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as profileService from "../services/profile";
import {
  computePremiumPdfCacheKey,
  parsePremiumPdfSections,
  premiumPdfBucket,
} from "../services/premiumPdf";
import { normalizeLanguage } from "../services/anthropic";
import { ownerCtx, ownsProfile } from "../services/owner";

function requiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpsError("invalid-argument", `${fieldName} is required`);
  }

  return value.trim();
}

function optionalString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function optionalCoordinate(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Enqueue an asynchronous premium PDF generation job.
 * Validates ownership + premium access, stores the report inputs in a
 * `pdfJobs/{jobId}` document, and returns immediately. The heavy AI + render
 * work runs in the `processPdfJob` Firestore trigger (see processPdfJob.ts).
 */
export const enqueuePremiumPdf = onCall(async (request) => {
  const profileId = requiredString(request.data?.profileId, "profileId");
  const ownerDeviceId = requiredString(request.data?.ownerDeviceId, "ownerDeviceId");
  const language = normalizeLanguage(request.data?.language);
  const relocationLat = optionalCoordinate(request.data?.relocationLat);
  const relocationLng = optionalCoordinate(request.data?.relocationLng);

  const ctx = ownerCtx(request);
  const profile = await profileService.getProfileById(profileId);
  if (!profile) {
    throw new HttpsError("not-found", "Profile not found");
  }
  if (!ownsProfile(profile, ctx)) {
    throw new HttpsError("permission-denied", "Access denied");
  }
  // PDF is part of the one-time 4-star Interpretations + PDF unlock (spent via
  // unlockFeature). Generation itself is free for unlocked profiles.
  if (!profile.hasPremiumPdf) {
    throw new HttpsError("permission-denied", "PREMIUM_REQUIRED");
  }

  const rawReport = request.data?.report ?? {};
  const sections = parsePremiumPdfSections(rawReport.sections);

  const cacheKey = computePremiumPdfCacheKey({
    profile,
    language,
    relocationLat,
    relocationLng,
    sections,
  });

  const db = getFirestore();

  // Cache hit: reuse the already-rendered PDF — no Claude calls, no regeneration.
  const cacheSnap = await db.collection("premiumPdfCache").doc(cacheKey).get();
  if (cacheSnap.exists) {
    const cache = cacheSnap.data() as {
      storagePath?: string;
      fileName?: string;
      byteLength?: number;
    };
    if (cache.storagePath) {
      const [exists] = await premiumPdfBucket().file(cache.storagePath).exists();
      if (exists) {
        const docRef = await db.collection("pdfJobs").add({
          kind: "client-download",
          status: "completed",
          cached: true,
          profileId,
          ownerDeviceId,
          ownerUid: ctx.uid ?? null,
          language,
          cacheKey,
          storagePath: cache.storagePath,
          fileName: cache.fileName ?? null,
          byteLength: cache.byteLength ?? null,
          createdAt: FieldValue.serverTimestamp(),
          completedAt: FieldValue.serverTimestamp(),
        });
        logger.info("enqueuePremiumPdf cache hit", { jobId: docRef.id, profileId, cacheKey });
        return { jobId: docRef.id, cached: true };
      }
    }
  }

  const job: Record<string, unknown> = {
    kind: "client-download",
    status: "pending",
    profileId,
    ownerDeviceId,
    ownerUid: ctx.uid ?? null,
    language,
    cacheKey,
    tokensCost: 0,
    report: {
      sections,
      title: optionalString(rawReport.title, 180) ?? null,
      subtitle: optionalString(rawReport.subtitle, 240) ?? null,
      generatedAt: optionalString(rawReport.generatedAt, 120) ?? null,
    },
    createdAt: FieldValue.serverTimestamp(),
  };
  if (relocationLat !== undefined) job.relocationLat = relocationLat;
  if (relocationLng !== undefined) job.relocationLng = relocationLng;

  const docRef = await db.collection("pdfJobs").add(job);

  logger.info("enqueuePremiumPdf queued", { jobId: docRef.id, profileId, language, cacheKey });

  return { jobId: docRef.id, cached: false };
});
