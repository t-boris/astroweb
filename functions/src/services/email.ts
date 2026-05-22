import { Resend } from "resend";
import { logger } from "firebase-functions/v2";

export async function sendPremiumPdfEmail(
  toEmail: string,
  profileName: string,
  pdfBuffer: Buffer
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.error("Missing RESEND_API_KEY");
    throw new Error("Resend not configured");
  }

  const resend = new Resend(apiKey);

  try {
    const { data, error } = await resend.emails.send({
      from: "AstroWeb <onboarding@resend.dev>",
      to: [toEmail],
      subject: `Your Premium Astrological Report, ${profileName} ✨`,
      html: `
        <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #D4A04A;">The Stars Have Spoken</h2>
          <p>Hello ${profileName},</p>
          <p>Thank you for unlocking your premium astrological report. Your cosmic blueprint reveals deep insights into your personality, karmic challenges, and hidden potentials.</p>
          <p>We have attached your comprehensive 15-page PDF report to this email.</p>
          <p>May the stars guide you on your journey.</p>
          <p>Warmly,<br/>The AstroWeb Team</p>
        </div>
      `,
      attachments: [
        {
          filename: `AstroWeb_Report_${profileName.replace(/\s+/g, "_")}.pdf`,
          content: pdfBuffer,
        },
      ],
    });

    if (error) {
      logger.error("Resend error", { error });
      throw new Error(error.message);
    }

    logger.info(`Email sent successfully to ${toEmail}`, { id: data?.id });
    return data;
  } catch (err) {
    logger.error("Failed to send email", { error: (err as Error).message });
    throw err;
  }
}
