import cron from "node-cron";
import FeedService from "../modules/feed/feed.service";

/**
 * Daily at 03:30: trims `post_resurfacings` (app#308). Each For you page adds
 * a row per older post it shows; a boost only reads a post's latest row, and
 * any row older than the boost cap's 11 days can't change a weight, so the
 * rest go. Idempotent; a failed night is retried the next.
 */
export function scheduleFeedResurfacingPrune() {
  cron.schedule("30 3 * * *", () => {
    FeedService.pruneResurfacings().catch((e) =>
      console.error("Feed resurfacing prune failed", e),
    );
  });
}
