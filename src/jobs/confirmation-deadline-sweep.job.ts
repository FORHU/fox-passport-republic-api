import cron from "node-cron";
import ConfirmationDeadlineSweepSvc from "../modules/transaction-status/confirmation-deadline-sweep.service";

/**
 * Every 5 minutes: expire ad-hoc marketplace items whose provider never
 * responded before their confirmationDeadline. See
 * ConfirmationDeadlineSweepSvc.runSweep — the actual deadline comparison
 * happens inside TransactionStatusSvc.transition, not here.
 */
export function scheduleConfirmationDeadlineSweep() {
  cron.schedule("*/5 * * * *", () => {
    ConfirmationDeadlineSweepSvc.runSweep().catch((e) =>
      console.error("Confirmation deadline sweep failed", e),
    );
  });
}
