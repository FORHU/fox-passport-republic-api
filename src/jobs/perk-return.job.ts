import cron from "node-cron";
import PerkSvc from "../modules/perk/perk.service";

/**
 * Hourly: give back the Tokens of every ready perk that has expired unused or
 * whose booking was cancelled. Idempotent per perk. See PerkSvc.returnDue.
 */
export function schedulePerkReturn() {
  cron.schedule("15 * * * *", () => {
    PerkSvc.returnDue().catch((e) =>
      console.error("Perk return job failed", e),
    );
  });
}
