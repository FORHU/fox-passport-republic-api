import { createTransport } from "nodemailer";

export async function sendEmail({
  to,
  cc,
  subject,
  text,
  html,
  attachments,
  tenant,
  email_credentials,
  support_email,
}: {
  to: string;
  cc?: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<any>;
  tenant?: string;
  email_credentials?: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  support_email?: string;
}): Promise<string> {
  const transporter = createTransport({
    ...email_credentials,
    tls: {
      rejectUnauthorized: false,
    },
  });

  const toEmails = to.split(",").map((email) => email.trim());
  const ccEmails = cc ? cc.split(",").map((email) => email.trim()) : [];

  const mailOptions: any = {
    from: `${tenant} <${support_email}>`,
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
