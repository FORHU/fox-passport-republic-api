import { randomBytes } from "crypto";

import UserSvc from "../../../services/user.service";
import { logger } from "../../logger";
import { createQueue } from "../index";

// Initialize the queue
export const userTenantQueue = createQueue("process_tenant_user");

const limit = 200;

const userJobs = async (code: string) => {
  const query = { tenant: { $eq: null } };
  const total = await UserSvc.countUsers(query);
  for (let offset = 0; offset < total; offset += limit) {
    const buffer = randomBytes(16);
    const jobId = buffer.toString("hex");
    logger.log({
      level: "info",
      message: "[User status]: Add each batch to the queue",
    });
    await userTenantQueue.add("process_tenant_user", { query, offset, limit, code }, { jobId: `batch-${jobId}`, attempts: 3 });
  }
};

userTenantQueue.process("process_tenant_user", async (job: any, done: any) => {
  const { query, offset, limit, code } = job.data;
  logger.log({
    level: "info",
    message: "[User tenant]: Process the current batch",
  });
  const users = await UserSvc.handleGetUsers(query, limit, offset);
  const payload = { tenant: code };
  for (const _user of users) {
    await UserSvc.updateUser({ _id: _user._id }, payload);
  }
  done();
});

export const initTenantUserQueue = async (code: string) => {
  try {
    await userJobs(code);
    logger.log({
      level: "info",
      message: "[user tenant] update processing jobs scheduled.",
    });
  } catch (error: any) {
    logger.log({
      level: "error",
      message: `[user tenant]: Failed to initialize user tenant jobs: ${error?.message}`,
    });
  }
};
