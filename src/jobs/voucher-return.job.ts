import cron from "node-cron";
import RewardService from "../modules/reward/reward.service";

/**
 * Daily at 01:30: return the Tokens of every Token voucher that expired
 * completely unused. Idempotent per voucher. See
 * RewardService.returnExpiredVouchers.
 */
export function scheduleVoucherReturn() {
  cron.schedule("30 1 * * *", () => {
    RewardService.returnExpiredVouchers().catch((e) =>
      console.error("Voucher return job failed", e),
    );
  });
}
