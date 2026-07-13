import cron from "node-cron";
import WaitlistRepo from "../repositories/waitlist.repository";

export function startWaitlistExpiryJob() {
  cron.schedule("* * * * *", async () => {
    try {
      const result = await WaitlistRepo.expireStaleHolds();
      if (result.count > 0) {
        console.log(`[Waitlist] Expired ${result.count} stale hold(s)`);
      }
    } catch (err) {
      console.error("[Waitlist] Expiry job failed:", err);
    }
  });
}
