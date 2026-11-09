import { PrismaClient } from "@prisma/client";
import { EVENT_ITEM_TRANSACTION_TYPE } from "../../src/modules/pricing/event-item-fee";

/** The default FoxPassport fee on an Event line, in percent. */
const DEFAULT_EVENT_ITEM_FEE_PERCENT = 5;

/**
 * The default FoxPassport fee for Event lines (#264 T3.3): 5%, no category.
 * Migration `20261109130000_add_default_event_item_fee_rule` adds the same row
 * on every migrated database; this covers one built some other way.
 *
 * Skipped only when a default that pricing would actually use is in force:
 * active, started, not ended, with a percentage. An expired or future-dated
 * default does not count, so it can't leave Event lines without a fee rule.
 * Nothing is updated or removed.
 */
export async function seedPlatformFees(prisma: PrismaClient) {
  console.log("Seeding the default Event line fee rule...");

  const now = new Date();
  const existing = await prisma.platformFeeConfig.findFirst({
    where: {
      AND: [
        {
          transactionType: EVENT_ITEM_TRANSACTION_TYPE,
          category: null,
          active: true,
          percentage: { not: null },
          effectiveFrom: { lte: now },
        },
        { OR: [{ subcategory: null }, { subcategory: "" }] },
        { OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }] },
      ],
    },
  });
  if (existing) {
    console.log("Default Event line fee rule already in force; left as is.");
    return;
  }

  await prisma.platformFeeConfig.create({
    data: {
      name: "Event line default",
      transactionType: EVENT_ITEM_TRANSACTION_TYPE,
      percentage: DEFAULT_EVENT_ITEM_FEE_PERCENT,
      currency: "PHP",
    },
  });
  console.log(
    `Seeded the default Event line fee rule (${DEFAULT_EVENT_ITEM_FEE_PERCENT}%).`,
  );
}
