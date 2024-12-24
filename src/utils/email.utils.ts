import { IS_QUEUE_MICROSERVICES, isDev } from "../config";
import { addEmailJob } from "../utils/queues/email/email.queue";
import { handleInitEmailQueue } from "./v2/microservices/queue/email";

export const handleSendEmail = ({ to, subject, html, attachments, cc, isAdmin }: any) => {
  /**
   * Adds a job to the email queue to send an email verification email to the user.
   * @param {string} to - The email address to send the verification email to.
   * @param {string} subject - The subject of the verification email.
   * @param {string} html - The HTML content of the verification email.
   */

  if (IS_QUEUE_MICROSERVICES) {
    return handleInitEmailQueue({
      to,
      subject: `${isDev ? "[STAGING]" : ""} ${subject}`,
      html,
      attachments,
      cc,
    });
  }

  addEmailJob({
    to,
    subject: `${isDev ? "[STAGING]" : ""} ${subject}`,
    html,
    attachments,
    cc,
    isAdmin,
  });
};
