import { randomBytes } from "crypto";

import { logger } from "../../../utils/logger";
import { createQueue } from "../index";
import UserRepo from "../../../repositories/user.repository";
import { user_status } from "../../../models/user.model";
import UserSvc from "../../../services/user.service";
import { sendTemplatedEmail } from "../../helpers";
import { SUPPORT_EMAIL } from "../../../config";
import { TENANT_CONFIGS } from "../../constant";

const currentDate = new Date();

// Initialize the queue
export const verificationReminderQueue = createQueue("process_venue_owner_team_members");

const limit = 200;

const verificationReminderJobs = async (tenant: string) => {
  const query: any = {
    fully_verified: false,
    role: "VENUE_OWNER",
    status: { $in: [user_status.ACTIVE, user_status.PENDING] },
    tenant,
  };
  const total = await UserRepo.countUsers(query);

  for (let offset = 0; offset < total; offset += limit) {
    const buffer = randomBytes(16);
    const jobId = buffer.toString("hex");
    logger.log({
      level: "info",
      message: "[file status]: Add each batch to the queue",
    });
    await verificationReminderQueue.add("process_verification_reminder", { query, offset, limit, tenant }, { jobId: `batch-${jobId}`, attempts: 3 });
  }
};

// // Queue processor
verificationReminderQueue.process("process_verification_reminder", async (job: any, done: any) => {
  try {
    const { query, offset, limit, tenant } = job.data;
    logger.log({
      level: "info",
      message: "[verification reminder]: Process the current batch",
    });

    const tenantConfig = TENANT_CONFIGS[tenant];

    const users = await UserSvc.getUsers(query, offset, limit);

    for (const user of users) {
      sendTemplatedEmail({
        subject: "Verification Reminder",
        email_data: {
          email: user?.email,
          first_name: user?.first_name?.replace(/_/g, " ") || "Venue Owner",
        },
        template_name: "verification-reminder.html",
        support_email: SUPPORT_EMAIL,
        email_credentials: tenantConfig.email_credentials,
        tenant: tenantConfig.name,
      });
    }

    done();
  } catch (error: any) {
    console.log({ error });
    logger.log({
      level: "error",
      message: `[File status]: Failed to process verification reminder: ${error?.message}`,
    });
    done(new Error("Failed to process verification reminder"));
  }
});

// Initialize
export const initVerificationReminderQueue = async () => {
  try {
    const tenants = ["VENUE4USE", "TH"];
    for (const tenant of tenants) {
      await verificationReminderJobs(tenant);
    }

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
