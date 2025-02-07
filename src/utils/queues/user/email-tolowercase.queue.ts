import { randomBytes } from "crypto";

import UserSvc from "../../../services/user.service";
import { logger } from "../../logger";
import { createQueue } from "../index";

// Initialize the queue
export const userEmailQueue = createQueue("process_user_email_queue");

const limit = 100;

const userEmailJobs = async () => {
  const total = await UserSvc.countUsers({});
  for (let offset = 0; offset < total; offset += limit) {
    const buffer = randomBytes(16);
    const jobId = buffer.toString("hex");
    logger.log({
      level: "info",
      message: "[venue status]: Add each batch to the queue",
    });
    await userEmailQueue.add("process_user_email_queue", { offset, limit }, { jobId: `batch-${jobId}`, attempts: 3 });
  }
};

userEmailQueue.process("process_user_email_queue", async (job: any, done: any) => {
  const { offset, limit } = job.data;

  logger.log({
    level: "info",
    message: "[venue tenant]: Process the current batch",
  });
  const users = await UserSvc.handleGetUsers({}, limit, offset);
  for (const user of users) {
    await UserSvc.updateUser({ _id: user._id }, { email: user?.email?.toLowerCase() });
  }
  done();
});

export const initUserEmailQueue = async () => {
  try {
    await userEmailJobs();
    logger.log({
      level: "info",
      message: "[venue tenant] update processing jobs scheduled.",
    });
  } catch (error: any) {
    logger.log({
      level: "error",
      message: `[venue tenant]: Failed to initialize user tenant jobs: ${error?.message}`,
    });
  }
};
