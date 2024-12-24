import { randomBytes } from "crypto";

import OrganizationMemberSvc from "../../../services/organization-member.service";
import { logger } from "../../../utils/logger";
import { createQueue } from "../index";

const currentDate = new Date();

// Initialize the queue
export const venueOwnerTeamMemberQueue = createQueue("process_venue_owner_team_members");

const limit = 200;

const venueOwnerTeamMemberJobs = async () => {
  const query: any = {
    suspension_time: { $ne: null },
    status: "ACCEPTED",
  };
  const total = await OrganizationMemberSvc.getTotalCountOrganizationMember(query);
  for (let offset = 0; offset < total; offset += limit) {
    const buffer = randomBytes(16);
    const jobId = buffer.toString("hex");
    logger.log({
      level: "info",
      message: "[file status]: Add each batch to the queue",
    });
    await venueOwnerTeamMemberQueue.add("process_venue_owner_team_members", { query, offset, limit }, { jobId: `batch-${jobId}`, attempts: 3 });
  }
};

// // Queue processor
venueOwnerTeamMemberQueue.process("process_venue_owner_team_members", async (job: any, done: any) => {
  try {
    const { query, offset, limit } = job.data;
    logger.log({
      level: "info",
      message: "[venue owner team member status]: Process the current batch",
    });

    const venueOwnerMember = await OrganizationMemberSvc.getOrganizationMembers(query, offset, limit);
    for (const member of venueOwnerMember) {
      if (member.suspension_time && currentDate > member.suspension_time) {
        await OrganizationMemberSvc.updateOrganizationMembers(member._id, { suspension_time: null });
      }
    }
    done();
  } catch (error: any) {
    console.log({ error });
    logger.log({
      level: "error",
      message: `[File status]: Failed to process venue owner team member: ${error?.message}`,
    });
    done(new Error("Failed to process venue owner team member"));
  }
});

// Initialize and schedule the enquiry jobs
export const initVenueOwnerMemberQueue = async () => {
  try {
    await venueOwnerTeamMemberJobs();
    logger.log({
      level: "info",
      message: "[venue owner team member status] update processing jobs scheduled.",
    });
  } catch (error: any) {
    logger.log({
      level: "error",
      message: `[venue owner team member status]: Failed to initialize venue owner team member jobs: ${error?.message}`,
    });
  }
};
