import fs from "fs";
import path from "path";
import { Resend } from "resend";
import { RESEND_API_KEY, FRONTEND_URL } from "../../config";
import { sendEmail as sendViaMailer } from "../mailer";

export const LOGO_DATA_URI = (() => {
  const logoPath = path.join(
    process.cwd(),
    "..",
    "fox-passport-republic-app",
    "public",
    "logofox.png",
  );
  try {
    if (fs.existsSync(logoPath)) {
      const ext = path.extname(logoPath).slice(1);
      const data = fs.readFileSync(logoPath);
      return `data:image/${ext};base64,${data.toString("base64")}`;
    }
  } catch {
    // fall through to URL fallback
  }
  return `${FRONTEND_URL}/logofox.png`;
})();

export const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
export const FROM_ADDRESS =
  process.env.EMAIL_FROM || "FoxPassport <onboarding@foxpassport.com>";

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function wrapEmail(innerHtml: string, showLogo = true): string {
  const logoSrc = showLogo
    ? `<img class="logo-img" src="${LOGO_DATA_URI}" alt="FoxPassport" />`
    : "";
  const headerHtml = `<div class="header">
      <div class="logo">
        ${logoSrc}
        <span class="logo-text">FoxPassport</span>
      </div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FoxPassport</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Space+Grotesk:wght@700;800&display=swap" rel="stylesheet" />
  <style>
    body { margin: 0; padding: 0; background: #f2f2f4; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111114; -webkit-font-smoothing: antialiased; -webkit-text-size-adjust: 100%; }
    .wrapper { max-width: 560px; margin: 40px auto; background: #ffffff; border: 1px solid #e5e5ea; border-radius: 20px; overflow: hidden; }
    .header { background: #000000; padding: 40px 40px 24px; text-align: center; }
    .logo { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; margin-bottom: 24px; }
    .logo-img { width: 40px; height: 40px; border-radius: 50%; display: inline-block; vertical-align: middle; }
    .logo-text { font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; font-family: 'Space Grotesk', sans-serif; }
    .body { padding: 32px 40px 40px; background: #ffffff; }
    h1 { margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #111114; font-family: 'Space Grotesk', sans-serif; }
    p { margin: 0 0 16px; font-size: 15px; color: #55555c; line-height: 1.6; }
    .footer { border-top: 1px solid #eeeeef; padding: 20px 40px; text-align: center; font-size: 12px; color: #9a9aa2; background: #ffffff; }
    @media only screen and (max-width: 480px) {
      .wrapper { margin: 16px auto; border-radius: 16px; }
      .header { padding: 24px 20px 16px; }
      .logo-text { font-size: 18px; }
      .body { padding: 24px 20px 32px; }
      h1 { font-size: 22px; }
      .footer { padding: 16px 20px; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    ${headerHtml}
    <div class="body">
      ${innerHtml}
    </div>
    <div class="footer">
      &copy; 2025 FoxPassport Inc. &bull; This is an automated message, please do not reply.
    </div>
  </div>
</body>
</html>`;
}

export async function sendResendEmail({
  to,
  subject,
  html,
}: EmailPayload): Promise<boolean> {
  console.log(`\n========== EMAIL TO: ${to} ==========`);
  console.log(`Subject: ${subject}`);
  console.log(`Content:\n${html.replace(/<[^>]+>/g, "").substring(0, 500)}`);
  console.log(`========================================\n`);

  if (!resend) {
    // No Resend key configured — fall back to the same SMTP transport the
    // auth flow uses (Ethereal in dev), so these emails are still
    // inspectable instead of silently vanishing into a console log.
    try {
      await sendViaMailer({ to, subject, html });
      console.log(`Email sent via SMTP fallback to ${to}: ${subject}`);
      return true;
    } catch (error) {
      console.error(`SMTP fallback email failed to ${to}:`, error);
      return false;
    }
  }

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject,
      html,
    });
    console.log(`Resend email sent to ${to}: ${subject}`);
    return true;
  } catch (error) {
    console.error(`Resend email failed to ${to}:`, error);
    return false;
  }
}
