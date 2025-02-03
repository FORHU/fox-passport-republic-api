import { randomBytes } from "crypto";

import { logger } from "../../logger";
import { sendEmail } from "../../mailer";
import { createQueue } from "../index";

export const sendEmailQueue = createQueue("sendEmail");

sendEmailQueue.process(async (job: any) => {
  try {
    const { to, subject, text, html, attachments, cc, support_email, email_credentials, tenant } = job.data;

    logger.log({
      level: "info",
      message: `PAYLOAD_EMAIL_QUEUE: ${JSON.stringify({
        to,
        subject,
        text,
        html,
        attachments,
        cc,
        support_email,
        email_credentials,
        tenant,
      })}`,
    });

    await sendEmail({ to, subject, text, html, attachments, cc, support_email, email_credentials, tenant });

    logger.log({
      level: "info",
      message: `QUEUE: Email sent successfully`,
    });

    return { success: true };
  } catch (error) {
    logger.log({
      level: "info",
      message: `Failed to process email queue: ${JSON.stringify(error)}`,
    });
    throw error;
  }
});

export const addEmailJob = async (data: any) => {
  try {
    const buffer = randomBytes(16);
    const jobId = buffer.toString("hex");
    const repeatableJobs = await sendEmailQueue.getRepeatableJobs();
    const jobExists = repeatableJobs.some((job) => job.id === jobId);

    if (!jobExists) {
      logger.log({
        level: "info",
        message: `QUEUE: Email processing`,
      });
      await sendEmailQueue.add(data);
    }
  } catch (error) {
    console.log({ error });
  }
};
