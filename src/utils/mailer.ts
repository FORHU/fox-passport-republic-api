import { createTransport } from "nodemailer";

import { MAILER_EMAIL, MAILER_PASSWORD, MAILER_TRANSPORT_HOST, MAILER_TRANSPORT_PORT, MAILER_TRANSPORT_SECURE, SUPPORT_EMAIL } from "../config";

export async function sendEmail({
  to,
  cc,
  subject,
  text,
  html,
  attachments,
}: {
  to: string;
  cc?: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<any>;
}): Promise<string> {
  const transporter = createTransport({
    host: MAILER_TRANSPORT_HOST,
    port: MAILER_TRANSPORT_PORT,
    secure: MAILER_TRANSPORT_SECURE,
    auth: {
      user: MAILER_EMAIL,
      pass: MAILER_PASSWORD,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  const toEmails = to.split(",").map((email) => email.trim());
  const ccEmails = cc ? cc.split(",").map((email) => email.trim()) : [];

  const mailOptions: any = {
    from: `Venue4use <${SUPPORT_EMAIL}>`,
    to: toEmails.join(", "),
    cc: ccEmails.length > 0 ? ccEmails.join(", ") : undefined,
    subject,
    attachments,
  };

  if (text) {
    mailOptions.text = text;
  }

  if (html) {
    mailOptions.html = html;
  }

  try {
    await transporter.sendMail(mailOptions);
    return "Email sent successfully";
  } catch (error) {
    throw new Error(`Failed to send email: ${error}`);
  }
}
