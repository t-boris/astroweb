import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";
import { premiumPdfBucket } from "../services/premiumPdf";
import { ownerCtx, ownsProfile } from "../services/owner";

function requiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpsError("invalid-argument", `${fieldName} is required`);
  }

  return value.trim();
}

/**
 * Poll the status of a premium PDF job. While pending/processing returns the
 * status only; once completed reads the rendered PDF from Cloud Storage and
 * returns it as base64 (the client never touches the bucket directly).
 */
export const getPremiumPdfJob = onCall(async (request) => {
  const jobId = requiredString(request.data?.jobId, "jobId");
  const ctx = ownerCtx(request);

  const snapshot = await getFirestore().collection("pdfJobs").doc(jobId).get();
  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Job not found");
  }

  const job = snapshot.data() as {
    ownerDeviceId?: string;
    ownerUid?: string;
    status?: string;
    error?: string;
    fileName?: string;
    storagePath?: string;
  };

  if (!ownsProfile({ ownerUid: job.ownerUid, ownerDeviceId: job.ownerDeviceId ?? "" }, ctx)) {
    throw new HttpsError("permission-denied", "Access denied");
  }

  const status = job.status ?? "pending";

  if (status === "failed") {
    return { status, error: job.error ?? "PDF generation failed" };
  }

  if (status !== "completed") {
    return { status };
  }

  if (!job.storagePath) {
    throw new HttpsError("internal", "Completed job is missing its file");
  }

  try {
    const [buffer] = await premiumPdfBucket().file(job.storagePath).download();
    return {
      status: "completed",
      fileName: job.fileName ?? "astroweb-premium.pdf",
      contentType: "application/pdf",
      base64: buffer.toString("base64"),
      byteLength: buffer.byteLength,
    };
  } catch (error) {
    logger.error("getPremiumPdfJob failed to read artifact", {
      jobId,
      error: (error as Error).message,
    });
    throw new HttpsError("internal", "Failed to read generated PDF");
  }
});
