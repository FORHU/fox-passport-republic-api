import { startAdminMemberCronJob, startCronJob, startPaymentCronJob, startStripeEmailCronJob, startVenueOwnerMemberCronJob } from "./jobs.queue";

export const startJobs = () => {
  startCronJob();
  startPaymentCronJob();
  startStripeEmailCronJob();
  startAdminMemberCronJob();
  startVenueOwnerMemberCronJob();
};
