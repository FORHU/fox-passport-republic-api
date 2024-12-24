import { randomBytes } from "crypto";

import { VENUE_4_USE_URI } from "../../../config";
import { user_role } from "../../../models/user.model";
import UserRepo from "../../../repositories/user.repository";
import StripeAccountSvc from "../../../services/stripe-account.service";
import { sendTemplatedEmail } from "../../../utils/helpers";
import { logger } from "../../../utils/logger";
import { createQueue } from "../index";
import VenueSvc from "../../../services/venue.service";

export const stripeAccountQueue = createQueue("stripeAccountQueue");
const limit = 200;

stripeAccountQueue.process("process_stripe_account", async (job: any) => {
  logger.log({
    level: "info",
    message: "[process_stripe_account] started queue.",
  });

  try {
    const { users } = job.data;
    for (const user of users) {
      const email = user.email;
      const firstName = user.first_name;

      if (email && firstName) {
        sendTemplatedEmail({
          subject: "Venue4Use: Please Set Up Your Stripe Account",
          email_data: {
            log_in_link: `${VENUE_4_USE_URI}/sg/login/venue`,
            email: email,
            first_name: firstName.replace(/_/g, " "),
            date_submitted: new Date().toISOString(),
          },
          template_name: "setup-stripe-account.html",
        });

        logger.log({
          level: "info",
          message: `[process_stripe_account]: Email sent to ${email}.`,
        });
      } else {
        logger.log({
          level: "warn",
          message: `[process_stripe_account]: Missing email or first name for user: ${JSON.stringify(user)}`,
        });
      }
    }

    logger.log({
      level: "info",
      message: `[process_stripe_account]: Emails sent to ${users.length} users.`,
    });
  } catch (error) {
    logger.log({
      level: "error",
      message: `[process_stripe_account]: ERROR ${JSON.stringify({ error })}.`,
    });
  }
});

const enqueueEmailJobs = async (users: any[]) => {
  for (let offset = 0; offset < users.length; offset += limit) {
    const buffer = randomBytes(16);
    const jobId = buffer.toString("hex");
    const batch = users.slice(offset, offset + limit);
    logger.log({
      level: "info",
      message: "[process_stripe_account]: Adding a batch of users to the queue.",
    });

    await stripeAccountQueue.add("process_stripe_account", { users: batch }, { jobId: `batch-${jobId}`, attempts: 3 });
  }
};

export const initStripeEmailProcess = async () => {
  const repeatableJobs = await stripeAccountQueue.getRepeatableJobs();
  const user_query = {
    role: { $in: [user_role.VENUE_OWNER, user_role.VENUE_LISTER] },
    stripe_account: { $ne: "COMPLETED" },
  };

  const users = await UserRepo.getUsers(user_query);
  const emailsToSend = [];

  for (const user of users) {
    const user_id = user._id;
    const existingStripe = await StripeAccountSvc.getAccount(user_id);
    const existingVenue = await VenueSvc.getVenue({ user: user_id, status: "PUBLISHED" });
    if (!existingStripe && existingVenue.length !== 0) {
      emailsToSend.push({ email: user.email, first_name: user.first_name });
    }
  }

  if (emailsToSend.length > 0) {
    const jobExists = repeatableJobs.some((job) => job.name === "process_stripe_account");

    if (!jobExists) {
      await enqueueEmailJobs(emailsToSend);
      logger.log({
        level: "info",
        message: "Receipt processing job scheduled process_stripe_account.",
      });
    } else {
      logger.log({
        level: "info",
        message: "Receipt processing job already scheduled process_stripe_account.",
      });
    }
  } else {
    logger.log({
      level: "info",
      message: "No users found without Stripe accounts.",
    });
  }
};
