import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

export interface PdfReportSection {
  title: string;
  body: string;
  category?: string;
  detail?: string;
}

export interface DownloadPremiumPdfPayload {
  profileId: string;
  ownerDeviceId: string;
  language?: "ru" | "en";
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
