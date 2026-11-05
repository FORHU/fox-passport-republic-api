import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * BUG-17 (api#160): the hidden auto-apply anchor (`AUTO-…`) never reaches a
 * client, and only the anchor is ever treated as one. Prisma is stubbed; what
 * is asserted is the query each read sends.
 */

const prisma = vi.hoisted(() => ({
  promotion: {
    findMany: vi.fn(async () => []),
    findUnique: vi.fn(async () => null),
  },
  voucher: { findFirst: vi.fn(async () => null) },
}));
vi.mock("../src/utils/prisma", () => ({ prisma }));

const { default: PromotionRepo } =
  await import("../src/modules/promotion/promotion.repository");

const VISIBLE = { NOT: { code: { startsWith: "AUTO-" } } };

beforeEach(() => vi.clearAllMocks());

describe("promotion reads for responses", () => {
  it.each([
    ["findAll", () => PromotionRepo.findAll(true), "findMany"],
    [
      "findAllForProvider",
      () => PromotionRepo.findAllForProvider("foxer-1"),
      "findMany",
    ],
    [
      "findByIdWithVisibleCodes",
      () => PromotionRepo.findByIdWithVisibleCodes("p1"),
      "findUnique",
    ],
  ] as const)(
    "%s leaves out the anchor and counts only visible codes",
    async (_n, read, method) => {
      await read();
      const [args] = prisma.promotion[method].mock.calls[0] as unknown as [
        {
          include: {
            vouchers: { where: unknown };
            _count: { select: { vouchers: { where: unknown } } };
          };
        },
      ];
      expect(args.include.vouchers.where).toEqual(VISIBLE);
      expect(args.include._count.select.vouchers.where).toEqual(VISIBLE);
    },
  );

  it("findById stays unfiltered for existence checks and the audit snapshot", async () => {
    await PromotionRepo.findById("p1");
    const [args] = prisma.promotion.findUnique.mock.calls[0] as unknown as [
      { include: { vouchers: { where?: unknown } } },
    ];
    expect(args.include.vouchers.where).toBeUndefined();
  });
});

describe("findAutoApplyVoucher", () => {
  it("matches the anchor only, never a printed code", async () => {
    await PromotionRepo.findAutoApplyVoucher("p1");
    expect(prisma.voucher.findFirst).toHaveBeenCalledWith({
      where: { promotionId: "p1", code: { startsWith: "AUTO-" } },
    });
  });
});
