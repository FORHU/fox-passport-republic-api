import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../src/utils/prisma";
import PlatformFeeConfigSvc from "../../src/modules/platform-fee-config/platform-fee-config.service";
import { Prisma } from "@prisma/client";
const Decimal = Prisma.Decimal;

vi.mock("../../src/utils/prisma", () => ({
  prisma: {
    platformFeeConfig: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const EXISTING_RULE = {
  id: "rule-1",
  name: "Existing Rule",
  transactionType: "event",
  category: null,
  subcategory: null,
  percentage: new Decimal(5),
  fixedAmount: null,
  currency: "PHP",
  priority: 0,
  active: true,
  effectiveFrom: new Date("2026-01-01"),
  effectiveUntil: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

describe("PlatformFeeConfigSvc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAll", () => {
    it("filters to active-only by default", async () => {
      (prisma.platformFeeConfig.findMany as any).mockResolvedValue([]);
      await PlatformFeeConfigSvc.getAll(false);
      expect(prisma.platformFeeConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { active: true } }),
      );
    });

    it("includes inactive rows when asked", async () => {
      (prisma.platformFeeConfig.findMany as any).mockResolvedValue([]);
      await PlatformFeeConfigSvc.getAll(true);
      expect(prisma.platformFeeConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });

  describe("create", () => {
    it("rejects a rule with neither percentage nor fixedAmount", async () => {
      await expect(
        PlatformFeeConfigSvc.create({ name: "Empty Rule" }),
      ).rejects.toThrow("At least one of percentage or fixedAmount");
      expect(prisma.platformFeeConfig.create).not.toHaveBeenCalled();
    });

    it("rejects effectiveUntil at or before effectiveFrom", async () => {
      await expect(
        PlatformFeeConfigSvc.create({
          name: "Bad Window",
          percentage: 5,
          effectiveFrom: new Date("2026-06-01"),
          effectiveUntil: new Date("2026-05-01"),
        }),
      ).rejects.toThrow("effectiveUntil must be after effectiveFrom");
    });

    it("rejects a blank name", async () => {
      await expect(
        PlatformFeeConfigSvc.create({ name: "   ", percentage: 5 }),
      ).rejects.toThrow("Fee rule name is required");
    });

    it("creates with a trimmed name when valid", async () => {
      (prisma.platformFeeConfig.create as any).mockResolvedValue(EXISTING_RULE);
      await PlatformFeeConfigSvc.create({
        name: "  New Rule  ",
        percentage: 5,
      });
      expect(prisma.platformFeeConfig.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: "New Rule" }),
        }),
      );
    });

    it("accepts fixedAmount alone with no percentage", async () => {
      (prisma.platformFeeConfig.create as any).mockResolvedValue(EXISTING_RULE);
      await expect(
        PlatformFeeConfigSvc.create({ name: "Flat Fee", fixedAmount: 25 }),
      ).resolves.toBeDefined();
    });
  });

  describe("update", () => {
    it("throws when the rule doesn't exist", async () => {
      (prisma.platformFeeConfig.findUnique as any).mockResolvedValue(null);
      await expect(
        PlatformFeeConfigSvc.update("missing-id", { priority: 5 }),
      ).rejects.toThrow("Fee rule not found");
    });

    it("validates the merged shape, not just the patch — clearing both fee fields is rejected", async () => {
      (prisma.platformFeeConfig.findUnique as any).mockResolvedValue(
        EXISTING_RULE,
      );
      await expect(
        PlatformFeeConfigSvc.update("rule-1", {
          percentage: null,
          fixedAmount: null,
        }),
      ).rejects.toThrow("At least one of percentage or fixedAmount");
      expect(prisma.platformFeeConfig.update).not.toHaveBeenCalled();
    });

    it("validates effectiveUntil against the existing effectiveFrom when only effectiveUntil is patched", async () => {
      (prisma.platformFeeConfig.findUnique as any).mockResolvedValue({
        ...EXISTING_RULE,
        effectiveFrom: new Date("2026-06-01"),
      });
      await expect(
        PlatformFeeConfigSvc.update("rule-1", {
          effectiveUntil: new Date("2026-01-01"),
        }),
      ).rejects.toThrow("effectiveUntil must be after effectiveFrom");
    });

    it("applies a valid partial update", async () => {
      (prisma.platformFeeConfig.findUnique as any).mockResolvedValue(
        EXISTING_RULE,
      );
      (prisma.platformFeeConfig.update as any).mockResolvedValue({
        ...EXISTING_RULE,
        priority: 10,
      });
      const result = await PlatformFeeConfigSvc.update("rule-1", {
        priority: 10,
      });
      expect(result.priority).toBe(10);
      expect(prisma.platformFeeConfig.update).toHaveBeenCalledWith({
        where: { id: "rule-1" },
        data: expect.objectContaining({ priority: 10 }),
      });
    });
  });

  describe("remove", () => {
    it("throws when the rule doesn't exist", async () => {
      (prisma.platformFeeConfig.findUnique as any).mockResolvedValue(null);
      await expect(PlatformFeeConfigSvc.remove("missing-id")).rejects.toThrow(
        "Fee rule not found",
      );
    });

    it("soft-deletes via the active flag, not a real delete", async () => {
      (prisma.platformFeeConfig.findUnique as any).mockResolvedValue(
        EXISTING_RULE,
      );
      (prisma.platformFeeConfig.update as any).mockResolvedValue({
        ...EXISTING_RULE,
        active: false,
      });
      await PlatformFeeConfigSvc.remove("rule-1");
      expect(prisma.platformFeeConfig.update).toHaveBeenCalledWith({
        where: { id: "rule-1" },
        data: { active: false },
      });
    });
  });
});
