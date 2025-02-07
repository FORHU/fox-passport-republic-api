import { randomBytes } from "crypto";
import { ObjectId } from "mongodb";

import { actions_enums } from "../../../models/user-logs.model";
import SpaceSvc from "../../../services/service-v2/space.service";
import UserLogsSvc from "../../../services/user-logs.service";
import { logger } from "../../logger";
import { createQueue } from "../index";

// Initialize the queue
export const userLogsQueue = createQueue("process_user_logs_queue");

const limit = 100;

const userLogsJobs = async () => {
  const total = await SpaceSvc.getTotalSpacesWithoutLogs();
  for (let offset = 0; offset < total; offset += limit) {
    const buffer = randomBytes(16);
    const jobId = buffer.toString("hex");
    logger.log({
      level: "info",
      message: "[venue status]: Add each batch to the queue",
    });
    await userLogsQueue.add("process_user_logs_queue", { offset, limit }, { jobId: `batch-${jobId}`, attempts: 3 });
  }
};

userLogsQueue.process("process_user_logs_queue", async (job: any, done: any) => {
  const { offset, limit } = job.data;
  logger.log({
    level: "info",
    message: "[venue tenant]: Process the current batch",
  });
  const spaces = await SpaceSvc.getSpaceWithoutUserLogs(limit, offset);
  for (const space of spaces) {
    const query = {
      user: new ObjectId("6687b6efdbfc939a9a8592d3"),
      details: { space: space._id },
      action: actions_enums.VIEW_SPACE,
    };

    const existingLogs = await UserLogsSvc.getUser(query);
    const count = existingLogs?.count || 0;
    await UserLogsSvc.updateUserlogs(query, { count: count + 1, updatedAt: new Date(), action: actions_enums.VIEW_SPACE });
  }
  done();
});

export const initUserLogsQueue = async () => {
  try {
    await userLogsJobs();
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
