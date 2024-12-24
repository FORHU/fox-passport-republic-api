import { randomBytes } from "crypto";

import { user_role, user_status } from "../../../models/user.model";
import UserRepo from "../../../repositories/user.repository";
import UserRolesRepo from "../../../repositories/user-roles.repository";
import { logger } from "../../../utils/logger";
import { createQueue } from "../index";

// Initialize the queue
export const useRolesQueue = createQueue("process_user_roles");

const limit = 20;

const userRoleJobs = async () => {
  const query = {
    password: { $exists: true },
  };
  const total = await UserRepo.countUser(query);

  for (let offset = 0; offset < total; offset += limit) {
    const buffer = randomBytes(16);
    const jobId = buffer.toString("hex");
    logger.log({
      level: "info",
      message: "[user roles]: starting user role queue",
    });
    await useRolesQueue.add("process_user_roles", { query, offset, limit }, { jobId: `batch-${jobId}`, attempts: 3 });
  }
};

// Queue processor
useRolesQueue.process("process_user_roles", async (job: any, done: any) => {
  try {
    const { query, offset, limit } = job.data;
    const users = await UserRepo.handleGetUser({ query, offset, limit });
    const updatePromises = users.map(async (user) => {
      const userRole = await UserRolesRepo.getUserRoles({ role: user.role, user: user._id });
      if (!userRole) {
        const userRolePayload = {
          role: user.role,
          user: user._id,
          status: "ACTIVE" as user_status,
          password: user.password,
          ...([user_role.VENUE_LISTER, user_role.VENUE_OWNER].includes(user?.role) && { organization: user?.organization }),
        };

        return await UserRolesRepo.createUserRoles(userRolePayload, true);
      }
    });

    await Promise.all(updatePromises);
    done();
  } catch (error: any) {
    logger.log({
      level: "error",
      message: `[user roles]: Failed to process user roles: ${error?.message}`,
    });
    done(new Error("Failed to process user roles"));
  }
});

// Initialize migrating of user roles
export const initUserRolesQueue = async () => {
  try {
    await userRoleJobs();
    logger.log({
      level: "info",
      message: "[user roles] update processing jobs scheduled.",
    });
  } catch (error: any) {
    logger.log({
      level: "error",
      message: `[user roles]: Failed to initialize user roles jobs: ${error?.message}`,
    });
  }
};
