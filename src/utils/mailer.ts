import type { Attachment } from "nodemailer/lib/mailer";
import { SendMailOptions, createTransport, getTestMessageUrl } from "nodemailer";
import {
  MAILER_EMAIL,
  MAILER_PASSWORD,
  MAILER_TRANSPORT_HOST,
  MAILER_TRANSPORT_PORT,
  MAILER_TRANSPORT_SECURE,
} from "../config";

export async function sendEmail({
  to,
  subject,
  text,
  html,
  attachments,
}: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: Attachment[];
}): Promise<string> {
  const transporter = createTransport({
    host: MAILER_TRANSPORT_HOST,
    port: MAILER_TRANSPORT_PORT,
    secure: MAILER_TRANSPORT_SECURE,
    auth: {
      user: MAILER_EMAIL,
      pass: MAILER_PASSWORD,
    },
  });

  const mailOptions: SendMailOptions = {
    from: `Fox Passport Republic <${MAILER_EMAIL}>`,
    to,
    subject,
  };

  if (text) {
    mailOptions.text = text;
  }

  if (html) {
    mailOptions.html = html;
  }

  if (attachments) {
    mailOptions.attachments = attachments;
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully to", to);
    // Ethereal never delivers anywhere real — this is the only way to see
    // what was sent. getTestMessageUrl returns false for a non-Ethereal
    // transport, so this is a no-op against a real provider.
    const previewUrl = getTestMessageUrl(info);
    if (previewUrl) {
      console.log("Ethereal preview:", previewUrl);
    }
    return Promise.resolve("Email sent successfully");
  } catch (error) {
    console.error("Error sending email:", error);
    return Promise.reject(error);
  }
}
