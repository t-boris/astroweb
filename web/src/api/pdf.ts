import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import type { AppLanguage } from "@/lib/language";

export interface PdfReportSection {
  title: string;
  body: string;
  category?: string;
  detail?: string;
}

export interface DownloadPremiumPdfPayload {
  profileId: string;
  ownerDeviceId: string;
  language?: AppLanguage;
  relocationLat?: number;
  relocationLng?: number;
  report: {
    title?: string;
    subtitle?: string;
    generatedAt?: string;
    sections: PdfReportSection[];
  };
}

export interface DownloadPremiumPdfResult {
  fileName: string;
  contentType: "application/pdf";
  base64: string;
  byteLength: number;
}

export async function downloadPremiumPdf(
  payload: DownloadPremiumPdfPayload,
): Promise<DownloadPremiumPdfResult> {
  const fn = httpsCallable<
    DownloadPremiumPdfPayload,
    DownloadPremiumPdfResult
  >(functions, "downloadPremiumPdf");

  const result = await fn(payload);
  return result.data;
}

export type PremiumPdfJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export interface PremiumPdfJobResult {
  status: PremiumPdfJobStatus;
  error?: string;
  fileName?: string;
  contentType?: "application/pdf";
  base64?: string;
  byteLength?: number;
}

/**
 * Enqueue an async premium PDF job. Returns a jobId immediately; the PDF is
 * generated server-side and fetched later via getPremiumPdfJob.
 */
export async function enqueuePremiumPdf(
  payload: DownloadPremiumPdfPayload,
): Promise<{ jobId: string }> {
  const fn = httpsCallable<DownloadPremiumPdfPayload, { jobId: string }>(
    functions,
    "enqueuePremiumPdf",
  );

  const result = await fn(payload);
  return result.data;
}

/** Poll a premium PDF job; returns the base64 PDF once status is "completed". */
export async function getPremiumPdfJob(payload: {
  jobId: string;
  ownerDeviceId: string;
}): Promise<PremiumPdfJobResult> {
  const fn = httpsCallable<
    { jobId: string; ownerDeviceId: string },
    PremiumPdfJobResult
  >(functions, "getPremiumPdfJob");

  const result = await fn(payload);
  return result.data;
}
