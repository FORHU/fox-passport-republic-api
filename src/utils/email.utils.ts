import { isDev } from "../config";
import { addEmailJob } from "./queues/email/email.queue";
export const handleSendEmail = ({ to, subject, html, attachments, cc, isAdmin, support_email, email_credentials, tenant }: any) => {
  /**
   * Adds a job to the email queue to send an email verification email to the user.
   * @param {string} to - The email address to send the verification email to.
   * @param {string} subject - The subject of the verification email.
   * @param {string} html - The HTML content of the verification email.
   */

  addEmailJob({
    to,
    subject: `${isDev ? "[STAGING]" : ""} ${subject}`,
    html,
    attachments,
    cc,
    isAdmin,
    support_email,
    email_credentials,
    tenant,
  });
};
