import { CronJob } from "cron";

import { EMAIL_STRIPE_NOTIFICATION, IS_QUEUE_MICROSERVICES } from "../../../config";
import { logger } from "../../../utils/logger";
import { handleInitPaymentQueueProcess } from "../../v2/microservices/queue/payment";
import { handleInitStripeAccountQueue } from "../../v2/microservices/queue/stripe-account";
import { initEnquiriesQueue } from "../enquiries/enquries-status.queue";
import { initPaymentQueueProcess } from "../payment/payment.queue";
import { initStripeEmailProcess } from "../stripe/stripe.email";
import { initAdminMemberQueue } from "../suspension/admin-team-member.queue";
import { initVenueOwnerMemberQueue } from "../suspension/venue-owner-member.queue";

export const startCronJob = async () => {
  try {
    const job = new CronJob("30 11 * * *", async () => {
      console.log("Running the scheduled task...");
      try {
        await initEnquiriesQueue();
      } catch (error) {
        logger.log({
          level: "info",
          message: `Failed to process enquiries in cron job:: ${error}`,
        });
      }
    });
    job.start();
  } catch (error) {
    logger.log({
      level: "info",
      message: `Failed to start enquiries queue:: ${JSON.stringify(error)}`,
    });
    throw error;
  }
};

export const startPaymentCronJob = async () => {
  try {
    const job = new CronJob("0 */2 * * *", async () => {
      logger.log({
        level: "info",
        message: `Running the scheduled task for payment transfer...`,
      });
      try {
        if (IS_QUEUE_MICROSERVICES) {
          return await handleInitPaymentQueueProcess();
        }
        await initPaymentQueueProcess();
      } catch (error) {
        logger.log({
          level: "info",
          message: `Failed to process enquiries in cron job:: ${JSON.stringify(error)}`,
        });
      }
    });
    job.start();
  } catch (error) {
    logger.log({
      level: "info",
      message: `Failed to start payments queue::: ${JSON.stringify(error)}`,
    });
    throw error;
  }
};

export const startStripeEmailCronJob = async () => {
  try {
    if (!EMAIL_STRIPE_NOTIFICATION) return;
    const job = new CronJob("0 12 * * *", async () => {
      logger.log({
        level: "info",
        message: `Running the scheduled task for stripe email sending...`,
      });
      try {
        if (IS_QUEUE_MICROSERVICES) {
          return await handleInitStripeAccountQueue();
        }
        await initStripeEmailProcess();
      } catch (error) {
        logger.log({
          level: "info",
          message: `Failed to process sending of email in cron job:: ${JSON.stringify(error)}`,
        });
      }
    });
    job.start();
  } catch (error) {
    logger.log({
      level: "info",
      message: `Failed to start sending of email queue::: ${JSON.stringify(error)}`,
    });
    throw error;
  }
};

export const startAdminMemberCronJob = async () => {
  try {
    const job = new CronJob("0 * * * *", async () => {
      logger.log({
        level: "info",
        message: `Running the scheduled task for admin team member...`,
      });
      try {
        await initAdminMemberQueue();
      } catch (error) {
        logger.log({
          level: "info",
          message: `Failed to process admin team member in cron job:: ${JSON.stringify(error)}`,
        });
      }
    });
    job.start();
  } catch (error) {
    logger.log({
      level: "info",
      message: `Failed to start admin team member queue::: ${JSON.stringify(error)}`,
    });
    throw error;
  }
};

export const startVenueOwnerMemberCronJob = async () => {
  try {
    const job = new CronJob("0 * * * *", async () => {
      logger.log({
        level: "info",
        message: `Running the scheduled task for venue owner team member...`,
      });
      try {
        await initVenueOwnerMemberQueue();
      } catch (error) {
        logger.log({
          level: "info",
          message: `Failed to process venue owner team member in cron job:: ${JSON.stringify(error)}`,
        });
      }
    });
    job.start();
  } catch (error) {
    logger.log({
      level: "info",
      message: `Failed to start venue owner team member queue::: ${JSON.stringify(error)}`,
    });
    throw error;
  }
};
