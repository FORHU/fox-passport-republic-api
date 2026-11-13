import cron from "node-cron";
import MilestoneSvc from "../modules/milestone/milestone.service";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Daily at 02:00: reconciles every citizen whose stamps, reviews or refunds
 * moved in the last two days, paying tiers a missed hook never paid and taking
 * back tiers a refund undid. Two days, not one, so a run that fails still gets
 * a second try the next night. Idempotent per tier. See MilestoneSvc.reconcile.
 */
export function scheduleMilestoneSweep() {
  cron.schedule("0 2 * * *", () => {
    MilestoneSvc.sweep(new Date(Date.now() - 2 * DAY_MS)).catch((e) =>
      console.error("Milestone sweep failed", e),
    );
  });
}
