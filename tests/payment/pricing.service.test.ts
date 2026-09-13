import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../../src/utils/prisma';
import PricingSvc from '../../src/modules/pricing/pricing.service';
import { Prisma } from '@prisma/client';
const Decimal = Prisma.Decimal;

// Mock Prisma
vi.mock('../../src/utils/prisma', () => ({
  prisma: {
    platformFeeConfig: {
      findMany: vi.fn(),
    },
    voucher: {
      findUnique: vi.fn(),
    },
    voucherRedemption: {
      count: vi.fn(),
    }
  }
}));

describe('PricingSvc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resolvePricingRule', () => {
    it('should resolve the most specific category over a global fallback', async () => {
      // Setup mock data
      const mockRules = [
        {
          id: 'global-1',
          name: 'Global Default',
          transactionType: 'event',
          category: null,
          subcategory: null,
          priority: 0,
          percentage: new Decimal(5),
          fixedAmount: new Decimal(0),
        },
        {
          id: 'birthday-1',
          name: 'Birthday Premium',
          transactionType: 'event',
          category: 'birthday',
          subcategory: null,
          priority: 0,
          percentage: new Decimal(2),
          fixedAmount: new Decimal(0),
        }
      ];

      (prisma.platformFeeConfig.findMany as any).mockResolvedValue(mockRules);

      const context = {
        transactionType: 'event',
        category: 'birthday'
      };

      const bestRule = await PricingSvc.resolvePricingRule(context);
      
      expect(bestRule).not.toBeNull();
      expect(bestRule?.id).toBe('birthday-1');
    });

    it('should respect priority overrides even if category matches', async () => {
      const mockRules = [
        {
          id: 'global-1',
          name: 'Global Priority Override',
          transactionType: null,
          category: null,
          subcategory: null,
          priority: 1000,
          percentage: new Decimal(1),
          fixedAmount: new Decimal(0),
        },
        {
          id: 'birthday-1',
          name: 'Birthday Premium',
          transactionType: 'event',
          category: 'birthday',
          subcategory: null,
          priority: 0,
          percentage: new Decimal(2),
          fixedAmount: new Decimal(0),
        }
      ];

      (prisma.platformFeeConfig.findMany as any).mockResolvedValue(mockRules);

      const context = {
        transactionType: 'event',
        category: 'birthday'
      };

      const bestRule = await PricingSvc.resolvePricingRule(context);
      
      expect(bestRule?.id).toBe('global-1');
    });
  });

  describe('validateAndCalculateVoucher', () => {
    it('should calculate percentage discount correctly', async () => {
      const mockVoucher = {
        id: 'v1',
        code: 'TEST10',
        active: true,
        promotion: {
          id: 'p1',
          active: true,
          discountType: 'percentage',
          discountValue: new Decimal(10),
          minSubtotal: null,
          maxDiscount: null,
          startDate: null,
          endDate: null,
          usageLimit: null,
          perUserLimit: null,
          transactionType: null,
          category: null
        }
      };
      
      (prisma.voucher.findUnique as any).mockResolvedValue(mockVoucher);

      const result = await PricingSvc.validateAndCalculateVoucher('TEST10', 1000, { transactionType: 'event', userId: 'user-1' });
      expect(result.discountAmount).toBe(100);
    });

    it('should calculate fixed discount correctly', async () => {
      const mockVoucher = {
        id: 'v1',
        code: 'FIXED50',
        active: true,
        promotion: {
          id: 'p1',
          active: true,
          discountType: 'fixed',
          discountValue: new Decimal(50),
          minSubtotal: null,
          maxDiscount: null,
          startDate: null,
          endDate: null,
          usageLimit: null,
          perUserLimit: null,
          transactionType: null,
          category: null
        }
      };
      
      (prisma.voucher.findUnique as any).mockResolvedValue(mockVoucher);

      const result = await PricingSvc.validateAndCalculateVoucher('FIXED50', 1000, { transactionType: 'event', userId: 'user-1' });
      expect(result.discountAmount).toBe(50);
    });

    it('should cap discount at maxDiscount', async () => {
      const mockVoucher = {
        id: 'v1',
        code: 'TEST50',
        active: true,
        promotion: {
          id: 'p1',
          active: true,
          discountType: 'percentage',
          discountValue: new Decimal(50),
          minSubtotal: null,
          maxDiscount: new Decimal(100),
          startDate: null,
          endDate: null,
          usageLimit: null,
          perUserLimit: null,
          transactionType: null,
          category: null
        }
      };
      
      (prisma.voucher.findUnique as any).mockResolvedValue(mockVoucher);

      const result = await PricingSvc.validateAndCalculateVoucher('TEST50', 1000, { transactionType: 'event', userId: 'user-1' });
      expect(result.discountAmount).toBe(100);
    });

    it('should reject if minimum subtotal is not met', async () => {
      const mockVoucher = {
        id: 'v1',
        code: 'MIN1000',
        active: true,
        promotion: {
          id: 'p1',
          active: true,
          discountType: 'fixed',
          discountValue: new Decimal(50),
          minSubtotal: new Decimal(1000),
          maxDiscount: null,
          startDate: null,
          endDate: null,
          usageLimit: null,
          perUserLimit: null,
          transactionType: null,
          category: null
        }
      };
      
      (prisma.voucher.findUnique as any).mockResolvedValue(mockVoucher);

      await expect(
        PricingSvc.validateAndCalculateVoucher('MIN1000', 500, { transactionType: 'event', userId: 'user-1' })
      ).rejects.toThrow(/Minimum subtotal/);
    });

    it('should reject if usage limits are exceeded', async () => {
      const mockVoucher = {
        id: 'v1',
        code: 'LIMIT1',
        active: true,
        promotion: {
          id: 'p1',
          active: true,
          discountType: 'fixed',
          discountValue: new Decimal(50),
          minSubtotal: null,
          maxDiscount: null,
          startDate: null,
          endDate: null,
          usageLimit: 1,
          perUserLimit: null,
          transactionType: null,
          category: null
        }
      };
      
      (prisma.voucher.findUnique as any).mockResolvedValue(mockVoucher);
      (prisma.voucherRedemption.count as any).mockResolvedValue(1);

      await expect(
        PricingSvc.validateAndCalculateVoucher('LIMIT1', 1000, { transactionType: 'event', userId: 'user-1' })
      ).rejects.toThrow(/usage limit reached/);
    });

    it('should reject if per-user limits are exceeded', async () => {
      const mockVoucher = {
        id: 'v1',
        code: 'USER_LIMIT1',
        active: true,
        promotion: {
          id: 'p1',
          active: true,
          discountType: 'fixed',
          discountValue: new Decimal(50),
          minSubtotal: null,
          maxDiscount: null,
          startDate: null,
          endDate: null,
          usageLimit: null,
          perUserLimit: 1,
          transactionType: null,
          category: null
        }
      };
      
      (prisma.voucher.findUnique as any).mockResolvedValue(mockVoucher);
      
      (prisma.voucherRedemption.count as any).mockImplementation((args: any) => {
        if (args.where.userId) return Promise.resolve(1);
        return Promise.resolve(0);
      });

      await expect(
        PricingSvc.validateAndCalculateVoucher('USER_LIMIT1', 1000, { transactionType: 'event', userId: 'user-1' })
      ).rejects.toThrow(/reached the usage limit/);
    });

    it('should reject an expired voucher', async () => {
      const mockVoucher = {
        id: 'v1',
        code: 'EXPIRED1',
        active: true,
        promotion: {
          id: 'p1',
          active: true,
          discountType: 'fixed',
          discountValue: new Decimal(50),
          minSubtotal: null,
          maxDiscount: null,
          startDate: null,
          endDate: new Date(Date.now() - 100000),
          usageLimit: null,
          perUserLimit: null,
          transactionType: null,
          category: null
        }
      };
      (prisma.voucher.findUnique as any).mockResolvedValue(mockVoucher);

      await expect(
        PricingSvc.validateAndCalculateVoucher('EXPIRED1', 1000, { transactionType: 'event', userId: 'user-1' })
      ).rejects.toThrow(/expired/);
    });
  });

  describe('calculatePrice', () => {
    it('should calculate final amount sequentially: Subtotal -> Discount -> Platform Fee', async () => {
      const mockVoucher = {
        id: 'v1',
        code: 'FOX2026',
        active: true,
        promotion: {
          id: 'p1',
          active: true,
          discountType: 'percentage',
          discountValue: new Decimal(10),
          minSubtotal: null,
          maxDiscount: null,
          startDate: null,
          endDate: null,
          usageLimit: null,
          perUserLimit: null,
          transactionType: null,
          category: null
        }
      };
      (prisma.voucher.findUnique as any).mockResolvedValue(mockVoucher);

      const mockRules = [
        {
          id: 'rule-1',
          name: 'Test Fee',
          transactionType: null,
          category: null,
          subcategory: null,
          priority: 0,
          percentage: new Decimal(2),
          fixedAmount: new Decimal(10),
        }
      ];
      (prisma.platformFeeConfig.findMany as any).mockResolvedValue(mockRules);

      const breakdown = await PricingSvc.calculatePrice(1000, {
        transactionType: 'event',
        voucherCode: 'FOX2026',
        userId: 'user-1'
      });

      expect(breakdown.subtotal).toBe(1000);
      expect(breakdown.discount?.amount).toBe(100);
      expect(breakdown.discountedSubtotal).toBe(900);
      expect(breakdown.platformFee?.amount).toBe(28);
      expect(breakdown.finalAmount).toBe(928);
    });
  });
});
