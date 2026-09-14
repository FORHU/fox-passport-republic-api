/**
 * One-time notice for the 14 Sep 2026 performerFoxer migration
 * (`20260914120000_add_performer_foxer_role`).
 *
 * That migration paused every `Service` row with `category: entertainment`
 * — their owner held `serviceFoxer`, not the new `performerFoxer`, so those
 * listings are invisible in public browse/search until the owner applies for
 * and is approved as `performerFoxer` (see BUSINESS-STRATEGY-MASTER.md §1a
 * and roles-and-spaces.md's "reassign, require reapplication" decision).
 *
 * The migration only touches the database; nothing tells the affected owner
 * their listing went dark. This is that notice — a real in-app notification
 * (pushed live over the socket the same way role-request decisions are),
 * run once, after the migration has been deployed.
 *
 * Usage: `pnpm exec ts-node --files tools/notify-paused-entertainment-owners.ts`
 * Safe to re-run: an owner who already has this notification is skipped, so
 * running it twice does not double-notify anyone.
 */

import { prisma } from "../src/utils/prisma";
import NotificationService from "../src/modules/notifications/user-notification.service";

const NOTIFICATION_TYPE = "performer_reapplication_required";

async function main() {
  const pausedListings = await prisma.service.findMany({
    where: { category: "entertainment", status: "paused", deletedAt: null },
    select: { id: true, name: true, ownerId: true },
  });

  if (pausedListings.length === 0) {
    console.log(
      "No paused entertainment listings found — migration may not be applied yet, or this has already run.",
    );
    return;
  }

  const listingsByOwner = new Map<string, { id: string; name: string }[]>();
  for (const listing of pausedListings) {
    const existing = listingsByOwner.get(listing.ownerId) ?? [];
    existing.push({ id: listing.id, name: listing.name });
    listingsByOwner.set(listing.ownerId, existing);
  }

  console.log(
    `Found ${pausedListings.length} paused listing(s) across ${listingsByOwner.size} owner(s).`,
  );

  let notified = 0;
  let skipped = 0;

  for (const [ownerId, listings] of listingsByOwner) {
    const alreadyNotified = await prisma.notification.findFirst({
      where: { userId: ownerId, type: NOTIFICATION_TYPE },
      select: { id: true },
    });
    if (alreadyNotified) {
      skipped++;
      continue;
    }

    const listingNames = listings.map((l) => l.name).join(", ");
    const plural = listings.length > 1 ? "listings" : "listing";

    await NotificationService.create({
      userId: ownerId,
      type: NOTIFICATION_TYPE,
      title: "Action needed: your entertainment listing is paused",
      message: `We've split entertainment into its own Performer Foxer role. Your ${plural} (${listingNames}) ${listings.length > 1 ? "are" : "is"} paused until you apply and get approved as a Performer Foxer — your existing listing details carry over, nothing is lost.`,
      metadata: {
        reason: "performer_foxer_migration",
        listingIds: listings.map((l) => l.id),
        applyUrl: "/foxer/apply?type=performer",
      },
    });
    notified++;
  }

  console.log(`Notified ${notified} owner(s); ${skipped} already notified.`);
}

main()
  .catch((err) => {
    console.error("notify-paused-entertainment-owners failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
