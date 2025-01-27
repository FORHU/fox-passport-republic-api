import { randomBytes } from "crypto";

import EmailLogsService from "../../../services/email_logs.service";
import UserSvc from "../../../services/user.service";
import { logger } from "../../../utils/logger";
import { sendEmail } from "../../mailer";
import { createQueue } from "../index";
import { ObjectId } from "mongodb";

export const sendEmailQueue = createQueue("sendEmail");

sendEmailQueue.process(async (job: any) => {
  try {
    const { to, subject, text, html, attachments, cc } = job.data;

    logger.log({
      level: "info",
      message: `PAYLOAD_EMAIL_QUEUE: ${JSON.stringify({
        to,
        subject,
        text,
        html,
        attachments,
        cc,
      })}`,
    });

    await sendEmail({ to, subject, text, html, attachments, cc });
    // await sendEmailLogs(job.data);

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

export const sendEmailLogs = async (data: any) => {
  try {
    const { to, subject, isAdmin } = data;

    let userDetails = null;

    if (!isAdmin) {
      userDetails = await UserSvc.getUser({ email: to });
      throw new Error(`User with email ${to} not found`);
    }

    await EmailLogsService.createEmailLog({
      user_id: isAdmin ? new ObjectId() : userDetails._id,
      email_type: subject,
      sentAt: new Date(),
      createdAt: new Date(),
    });

    logger.log({
      level: "info",
      message: `Email log for ${to} saved successfully`,
    });
  } catch (error) {
    logger.log({
      level: "error",
      message: `Failed to save email log for ${data.to}: ${error.message}`,
    });
    throw error;
  }
};
