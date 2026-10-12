import { Resend } from "resend";
import { logger } from "firebase-functions/v2";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Parse user-supplied letter recipients — a comma-separated string or an array
 * of strings — into a clean, validated, de-duplicated list of email addresses
 * (lowercased, capped). Invalid entries are dropped silently.
 */
export function parseRecipientEmails(input: unknown, max = 5): string[] {
  const raw = Array.isArray(input)
    ? input.join(",")
    : typeof input === "string"
      ? input
      : "";
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const email = part.trim().toLowerCase();
    if (email && EMAIL_RE.test(email) && !seen.has(email)) {
      seen.add(email);
      out.push(email);
      if (out.length >= max) break;
    }
  }
  return out;
}

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
      from: "NatalMystic <reports@natalmystic.com>",
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

/**
 * Personal Astrologer letter teaser — a short preview + "open in app" link.
 * No interactive content in email (the rich letter + questions live in the app).
 */
export async function sendLetterTeaserEmail(params: {
  toEmail: string;
  astrologerName: string;
  teaser: string;
  appUrl: string;
  /** Full letter body HTML; when present the whole letter is rendered. */
  html?: string;
  /** Localized date string shown under the title. */
  dateLabel?: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn("RESEND_API_KEY missing — skipping letter email");
    return;
  }
  const resend = new Resend(apiKey);
  const body = params.html?.trim()
    ? params.html
    : `<p>${params.teaser}</p>`;
  const html = renderLetterEmailHtml({
    astrologerName: params.astrologerName,
    bodyHtml: body,
    appUrl: params.appUrl,
    dateLabel: params.dateLabel ?? "",
  });
  try {
    const { error } = await resend.emails.send({
      from: "NatalMystic <astrologer@natalmystic.com>",
      to: [params.toEmail],
      subject: `✦ ${params.astrologerName} wrote to you`,
      html,
    });
    if (error) logger.error("letter email Resend error", { error, to: params.toEmail });
  } catch (err) {
    logger.error("Failed to send letter email", { error: (err as Error).message });
  }
}

/**
 * Render a polished, email-client-safe HTML letter: a dark cosmic card with the
 * full reading, a divider, and an "open in app" CTA. Layout uses tables and the
 * letter's own tags (h3/p/strong/ul) are styled via a <style> block.
 */
function renderLetterEmailHtml(params: {
  astrologerName: string;
  bodyHtml: string;
  appUrl: string;
  dateLabel: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  .nm-letter h2, .nm-letter h3 { font-family: Georgia, 'Times New Roman', serif; color:#8fb6ff; font-size:18px; line-height:1.35; margin:24px 0 8px; }
  .nm-letter p { color:#c9d6f5; line-height:1.75; font-size:15px; margin:0 0 14px; }
  .nm-letter strong { color:#ffffff; }
  .nm-letter em { color:#dfeaff; }
  .nm-letter ul { padding-left:20px; margin:0 0 14px; }
  .nm-letter li { color:#c9d6f5; line-height:1.65; font-size:15px; margin:5px 0; }
  .nm-letter a { color:#8fb6ff; }
</style>
</head>
<body style="margin:0; padding:0; background:#070b18; -webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070b18;">
    <tr><td align="center" style="padding:28px 14px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background:#0b1124; border:1px solid rgba(143,182,255,0.18); border-radius:18px; overflow:hidden; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="padding:32px 34px 0; text-align:center;">
          <div style="font-size:34px; line-height:1; color:#e8c969;">✦</div>
          <div style="font-family:Georgia,'Times New Roman',serif; color:#dfeaff; font-size:23px; margin-top:10px;">A letter from ${params.astrologerName}</div>
          ${params.dateLabel ? `<div style="color:#7e8db5; font-size:11px; letter-spacing:0.14em; text-transform:uppercase; margin-top:8px;">${params.dateLabel}</div>` : ""}
          <div style="height:1px; background:linear-gradient(90deg, rgba(11,17,36,0), rgba(143,182,255,0.4), rgba(11,17,36,0)); margin:22px 0 6px;"></div>
        </td></tr>
        <tr><td class="nm-letter" style="padding:6px 34px 8px;">
          ${params.bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 34px 32px; text-align:center;">
          <a href="${params.appUrl}" style="background:#5b8def; color:#ffffff; text-decoration:none; padding:14px 28px; border-radius:999px; display:inline-block; font-size:15px; font-weight:600;">Open in the app →</a>
          <div style="color:#7e8db5; font-size:12px; line-height:1.6; margin-top:16px;">Answer today's questions and ask your astrologer anything — inside the app.</div>
        </td></tr>
        <tr><td style="padding:0 34px 30px; text-align:center;">
          <div style="height:1px; background:rgba(143,182,255,0.12); margin-bottom:16px;"></div>
          <div style="color:#5d678a; font-size:11px; line-height:1.7;">For reflection and inspiration — not a prediction.<br/>Manage delivery in the app · NatalMystic</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
