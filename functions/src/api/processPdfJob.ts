import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { generatePremiumPdf } from "../services/pdf";
import { sendPremiumPdfEmail } from "../services/email";
import { resolveOwnedChart } from "../services/chartResolver";
import {
  generatePremiumPdfArtifact,
  premiumPdfBucket,
  premiumPdfCacheStoragePath,
} from "../services/premiumPdf";
import { getProfileById } from "../services/profile";
import { refundToWallet, walletKeyFromProfile } from "../services/wallet";
import { normalizeLanguage } from "../services/anthropic";
import type { PremiumPdfSection } from "../services/pdf";

export const processPdfJob = onDocumentCreated(
  {
    document: "pdfJobs/{jobId}",
    timeoutSeconds: 540,
    memory: "1GiB",
    secrets: ["ANTHROPIC_API_KEY", "RESEND_API_KEY"],
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const data = snapshot.data();

    if (data.kind === "client-download") {
      await handleClientDownloadJob(snapshot, event.params.jobId);
      return;
    }

    await handleLegacyEmailJob(snapshot, data);
  },
);

/**
 * New async path: render the real AI-narrated premium PDF and store it in
 * Cloud Storage for the client to fetch via getPremiumPdfJob.
 */
async function handleClientDownloadJob(
  snapshot: FirebaseFirestore.QueryDocumentSnapshot,
  jobId: string,
): Promise<void> {
  const data = snapshot.data();
  const { profileId, ownerDeviceId } = data;

  // Cache-hit jobs are created already "completed" — never regenerate them.
  if (data.status !== "pending") {
    return;
  }

  try {
    await snapshot.ref.update({ status: "processing" });

    const relocationLat =
      typeof data.relocationLat === "number" ? data.relocationLat : undefined;
    const relocationLng =
      typeof data.relocationLng === "number" ? data.relocationLng : undefined;
    const isRelocated = relocationLat !== undefined && relocationLng !== undefined;

    const { profile, chart } = await resolveOwnedChart({
      profileId,
      ownerDeviceId,
      uid: typeof data.ownerUid === "string" ? data.ownerUid : null,
      relocationLat,
      relocationLng,
    });

    const report = data.report ?? {};
    const sections = (report.sections ?? []) as PremiumPdfSection[];

    const { buffer, fileName } = await generatePremiumPdfArtifact({
      profile,
      chart,
      language: normalizeLanguage(data.language),
      sections,
      isRelocated,
      title: report.title ?? undefined,
      subtitle: report.subtitle ?? undefined,
      generatedAt: report.generatedAt ?? undefined,
    });

    // Store at the stable cache path so identical future requests reuse it.
    const cacheKey: string | undefined = data.cacheKey;
    const storagePath = cacheKey
      ? premiumPdfCacheStoragePath(cacheKey)
      : `premium-pdfs/${jobId}.pdf`;
    await premiumPdfBucket()
      .file(storagePath)
      .save(buffer, { contentType: "application/pdf", resumable: false });

    if (cacheKey) {
      await getFirestore().collection("premiumPdfCache").doc(cacheKey).set({
        storagePath,
        fileName,
        byteLength: buffer.byteLength,
        profileId,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    await snapshot.ref.update({
      status: "completed",
      fileName,
      storagePath,
      byteLength: buffer.byteLength,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    logger.info("processPdfJob completed", { jobId, profileId, cacheKey, byteLength: buffer.byteLength });
  } catch (error) {
    logger.error("processPdfJob failed", { jobId, error: (error as Error).message });
    // Refund the tokens charged at enqueue — the report wasn't produced.
    const cost = typeof data.tokensCost === "number" ? data.tokensCost : 0;
    if (cost > 0 && profileId) {
      try {
        const prof = await getProfileById(profileId);
        const key = prof && walletKeyFromProfile(prof);
        if (key) await refundToWallet(key, cost);
        logger.info("processPdfJob refunded tokens after failure", { jobId, profileId, cost });
      } catch (refundError) {
        logger.error("processPdfJob failed to refund tokens", {
          jobId,
          error: (refundError as Error).message,
        });
      }
    }
    await snapshot.ref.update({
      status: "failed",
      error: (error as Error).message,
    });
  }
}

/**
 * Legacy path (purchase webhook / checkout mock): placeholder report emailed
 * to the customer. Untouched behavior — kept for backward compatibility.
 */
async function handleLegacyEmailJob(
  snapshot: FirebaseFirestore.QueryDocumentSnapshot,
  data: FirebaseFirestore.DocumentData,
): Promise<void> {
  const { profileId, customerEmail, profileName } = data;

  try {
    logger.info(`Starting PDF generation job for profile ${profileId}`);

    await snapshot.ref.update({ status: "processing" });

    const markdownContent = `
# The Cosmic Blueprint of ${profileName}

## Introduction
The universe was uniquely aligned at the moment of your birth. This report will uncover the deep psychological patterns...

### The Core Personality (Sun, Moon, Rising)
Your Sun sign indicates your core ego, while the Moon represents your emotional inner world.

## Karmic Challenges
The placement of Saturn and the Nodes of the Moon suggest areas where you must overcome past-life karma...

## Relationship Potential
Venus and Mars outline your approach to love, passion, and partnership...
`;

    const pdfBuffer = await generatePremiumPdf(profileName, markdownContent);

    if (customerEmail) {
      await sendPremiumPdfEmail(customerEmail, profileName, pdfBuffer);
      logger.info(`Successfully sent premium PDF to ${customerEmail}`);
      await snapshot.ref.update({
        status: "completed",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      logger.warn("No customerEmail provided, PDF generated but not sent.");
      await snapshot.ref.update({ status: "failed", error: "No customer email" });
    }
  } catch (error) {
    logger.error("Error processing PDF job", { error: (error as Error).message });
    await snapshot.ref.update({ status: "failed", error: (error as Error).message });
  }
}
