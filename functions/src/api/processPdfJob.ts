import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { generatePremiumPdf } from "../services/pdf";
import { sendPremiumPdfEmail } from "../services/email";
import { getChart } from "../api/getChart";

export const processPdfJob = onDocumentCreated("pdfJobs/{jobId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;

  const { profileId, ownerDeviceId, customerEmail, profileName } = snapshot.data();

  try {
    logger.info(`Starting PDF generation job for profile ${profileId}`);

    // Update status
    await snapshot.ref.update({ status: "processing" });

    // 1. We would fetch the chart and ask Gemini to generate the 15-page deep report.
    // For this implementation, we simulate fetching the deep interpretation.
    // In a real scenario, we'd use the astrology data and call Gemini with a heavy prompt.
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

    // 2. Generate PDF
    const pdfBuffer = await generatePremiumPdf(profileName, markdownContent);

    // 3. Send Email
    if (customerEmail) {
      await sendPremiumPdfEmail(customerEmail, profileName, pdfBuffer);
      logger.info(`Successfully sent premium PDF to ${customerEmail}`);
      await snapshot.ref.update({ status: "completed", completedAt: admin.firestore.FieldValue.serverTimestamp() });
    } else {
      logger.warn("No customerEmail provided, PDF generated but not sent.");
      await snapshot.ref.update({ status: "failed", error: "No customer email" });
    }

  } catch (error) {
    logger.error("Error processing PDF job", { error: (error as Error).message });
    await snapshot.ref.update({ status: "failed", error: (error as Error).message });
  }
});
