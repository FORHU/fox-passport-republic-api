import {
  startAdminMemberCronJob,
  startCronJob,
  startPaymentCronJob,
  startStripeEmailCronJob,
  startVenueOwnerMemberCronJob,
  startAccountVerificationReminderCronJob,
} from "./jobs.queue";

export const startJobs = () => {
  startCronJob();
  startPaymentCronJob();
  startStripeEmailCronJob();
  startAdminMemberCronJob();
  startVenueOwnerMemberCronJob();
  startAccountVerificationReminderCronJob();
};
