import { randomBytes } from "crypto";

import VenueSvc from "../../../services/venue.service";
import { logger } from "../../logger";
import { createQueue } from "../index";

// Initialize the queue
export const venueTenantQueue = createQueue("process_tenant_venue");

const limit = 200;

const venueJobs = async (code: string) => {
  const query = { tenant: { $eq: null } };
  const total = await VenueSvc.handleCountVenues(query);
  for (let offset = 0; offset < total; offset += limit) {
    const buffer = randomBytes(16);
    const jobId = buffer.toString("hex");
    logger.log({
      level: "info",
      message: "[venue status]: Add each batch to the queue",
    });
    await venueTenantQueue.add("process_tenant_venue", { query, offset, limit, code }, { jobId: `batch-${jobId}`, attempts: 3 });
  }
};

venueTenantQueue.process("process_tenant_venue", async (job: any, done: any) => {
  const { query, offset, limit, code } = job.data;
  logger.log({
    level: "info",
    message: "[venue tenant]: Process the current batch",
  });
  const venues = await VenueSvc.handleGetVenues(query, limit, offset);
  const payload = { tenant: code };
  console.log({ query, payload });
  for (const _venue of venues) {
    await VenueSvc.handleUpdateVenue(_venue._id, payload);
  }
  done();
});

export const initTenantVenueQueue = async (code: string) => {
  try {
    await venueJobs(code);
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
