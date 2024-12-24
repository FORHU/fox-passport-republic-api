import { randomBytes } from "crypto";

import AdminMemberSvc from "../../../services/admin-members.service";
import { logger } from "../../../utils/logger";
import { createQueue } from "../index";

const currentDate = new Date();

// Initialize the queue
export const adminTeamMemberQueue = createQueue("process_admin_team_members");

const limit = 200;

const adminTeamMemberJobs = async () => {
  const query = { status: "ACCEPTED" };
  const total = await AdminMemberSvc.countAdminMembers(query);
  for (let offset = 0; offset < total; offset += limit) {
    const buffer = randomBytes(16);
    const jobId = buffer.toString("hex");
    logger.log({
      level: "info",
      message: "[file status]: Add each batch to the queue",
    });
    await adminTeamMemberQueue.add("process_admin_team_members", { query, offset, limit }, { jobId: `batch-${jobId}`, attempts: 3 });
  }
};

// // Queue processor
adminTeamMemberQueue.process("process_admin_team_members", async (job: any, done: any) => {
  try {
    const { query, offset, limit } = job.data;
    logger.log({
      level: "info",
      message: "[admin team member status]: Process the current batch",
    });

    const adminMember = await AdminMemberSvc.handleGetAdminMembers(query, offset, limit);
    for (const member of adminMember) {
      if (member.suspension_time && currentDate > member.suspension_time) {
        console.log(member._id, "do!");
        await AdminMemberSvc.updateAdminMemberById(member._id, { suspension_time: null });
      }
    }
    done();
  } catch (error: any) {
    logger.log({
      level: "error",
      message: `[File status]: Failed to process admin team member: ${error?.message}`,
    });
    done(new Error("Failed to process admin team member"));
  }
});

// Initialize and schedule the enquiry jobs
export const initAdminMemberQueue = async () => {
  try {
    await adminTeamMemberJobs();
    logger.log({
      level: "info",
      message: "[admin team member status] update processing jobs scheduled.",
    });
  } catch (error: any) {
    logger.log({
      level: "error",
      message: `[admin team member status]: Failed to initialize admin team member jobs: ${error?.message}`,
    });
  }
};
