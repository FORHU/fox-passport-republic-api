import { PrismaClient } from "@prisma/client";

/**
 * Fixed, memorable codes rather than `PromotionSvc.generateVouchers`'s random
 * ones — a seeder needs codes a developer/tester can actually type in, not a
 * fresh random batch every run. Deliberately left without a
 * transactionType/category restriction narrower than "any asset booking" /
 * "any service booking" / "any event" — a category value that doesn't match
 * what's actually seeded (asset.seeder.ts, service.seeder.ts) would silently
 * make the voucher unusable, which defeats the point of seeding it at all.
 */
const PROMOTIONS: {
  name: string;
  description: string;
  transactionType: string | null;
  discountType: "percentage" | "fixed";
  discountValue: number;
  minSubtotal?: number;
  maxDiscount?: number;
  perUserLimit?: number;
  codes: string[];
}[] = [
  {
    name: "Welcome Discount",
    description: "10% off, any booking type, for testing the voucher flow end to end.",
    transactionType: null,
    discountType: "percentage",
    discountValue: 10,
    perUserLimit: 10,
    codes: ["WELCOME10"],
  },
  {
    name: "Gear Rental Sale",
    description: "₱500 off any equipment (Asset) booking.",
    transactionType: "asset",
    discountType: "fixed",
    discountValue: 500,
    minSubtotal: 1000,
    perUserLimit: 10,
    codes: ["GEARSALE500"],
  },
  {
    name: "Talent Booking Discount",
    description: "15% off any talent/performer (Service) booking, capped at ₱2,000.",
    transactionType: "service",
    discountType: "percentage",
    discountValue: 15,
    maxDiscount: 2000,
    perUserLimit: 10,
    codes: ["TALENT15"],
  },
  {
    name: "Event Checkout Promo",
    description: "20% off Central Payment event checkout, capped at ₱5,000.",
    transactionType: "event",
    discountType: "percentage",
    discountValue: 20,
    maxDiscount: 5000,
    perUserLimit: 10,
    codes: ["EVENT20"],
  },
];

export async function seedPromotions(prisma: PrismaClient) {
  console.log("Seeding promotions and vouchers...");

  let voucherCount = 0;

  for (const promo of PROMOTIONS) {
    let promotion = await prisma.promotion.findFirst({
      where: { name: promo.name },
    });

    if (!promotion) {
      promotion = await prisma.promotion.create({
        data: {
          name: promo.name,
          description: promo.description,
          transactionType: promo.transactionType,
          discountType: promo.discountType,
          discountValue: promo.discountValue,
          minSubtotal: promo.minSubtotal ?? null,
          maxDiscount: promo.maxDiscount ?? null,
          perUserLimit: promo.perUserLimit ?? null,
          active: true,
        },
      });
    }

    for (const code of promo.codes) {
      const existing = await prisma.voucher.findUnique({ where: { code } });
      if (existing) continue;

      await prisma.voucher.create({
        data: { code, promotionId: promotion.id, active: true },
      });
      voucherCount++;
    }
  }

  console.log(
    `Seeded ${PROMOTIONS.length} promotions with ${voucherCount} new voucher code(s).`,
  );
}
