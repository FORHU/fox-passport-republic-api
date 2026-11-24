import cron from "node-cron";
import PackageRequestSweepSvc from "../modules/event-template/package-request-sweep.service";

/**
 * Hourly: package requests not answered in 3 days expire, and a reminder
 * goes out after 2 (api#462). Idempotent: each step only touches lines still
 * waiting. See PackageRequestSweepSvc.
 */
export function schedulePackageRequestSweep() {
  cron.schedule("15 * * * *", () => {
    PackageRequestSweepSvc.run().catch((e) =>
      console.error("Package request sweep failed", e),
    );
  });
}
