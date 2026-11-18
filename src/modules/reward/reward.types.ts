import { UserPath } from "@prisma/client";

export interface GrantRewardParams {
  userId: string;
  path?: UserPath;
  action: string;
  refType: string;
  refId: string;
  coinsOverride?: number;
  idempotencyKey?: string;
  bookingFeeAmount?: number; // When action is booking-tied, the platform fee collected
  /**
   * Hold this grant's Coins as Pending instead of paying them at once. Only the
   * caller knows when to free them, and does so with RewardRepo.releaseGrant:
   * the release-everything path never frees a grant held this way.
   */
  holdUntilAttended?: boolean;
}

export interface GrantRewardResult {
  coinsAwarded: number;
  isIdempotentReplay?: boolean;
}

export interface ReverseRewardParams {
  refType: string;
  refId: string;
  action?: string;
  userId?: string;
  reason?: string;
}

export interface ReverseRewardResult {
  reversed: boolean;
  coinsReversed: number;
  grantEventId?: string;
}

export interface RewardRuleConfig {
  action: string;
  xp: number;
  coins: number;
  dailyCap?: number | null;
  onceOnly: boolean;
  active: boolean;
}

export interface RewardCatalogItem {
  id: string;
  title: string;
  description: string | null;
  targetAudience: string;
  coinCost: number;
  rewardType: string;
  discountPhp: number | null;
  discountPercentage: number | null;
  canAfford: boolean;
}

export interface WalletHistoryItem {
  id: string;
  type: "grant" | "lifecycle";
  action?: string;
  lifecycleType?: string;
  coinsDelta: number;
  refType?: string;
  refId?: string;
  reason?: string | null;
  /** A grant whose Coins are still held, not yet spendable. */
  isPending?: boolean;
  createdAt: Date;
}

export interface WalletSummary {
  coins: number;
  pendingCoins: number;
  totalEarnedCoins: number;
  history: WalletHistoryItem[];
}

export interface RedeemRewardParams {
  userId: string;
  rewardId: string;
  path?: UserPath;
}

export interface RedeemRewardResult {
  success: boolean;
  redemptionId: string;
  coinsSpent: number;
  remainingCoins: number;
  voucher: {
    id: string;
    code: string;
    discountPhp: number | null;
    discountPercentage: number | null;
    expiresAt: Date;
  };
}
