import { UserPath } from "@prisma/client";

export interface GrantRewardParams {
  userId: string;
  path?: UserPath;
  action: string;
  refType: string;
  refId: string;
  xpOverride?: number;
  coinsOverride?: number;
  idempotencyKey?: string;
  bookingFeeAmount?: number; // When action is booking-tied, the platform fee collected
}

export interface GrantRewardResult {
  xpAwarded: number;
  coinsAwarded: number;
  newLevel: number;
  newRank: string;
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
  xpReversed: number;
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
  minLevel: number;
  canAfford: boolean;
  levelQualified: boolean;
}

export interface WalletHistoryItem {
  id: string;
  type: "grant" | "lifecycle";
  action?: string;
  lifecycleType?: string;
  xp: number;
  coinsDelta: number;
  refType?: string;
  refId?: string;
  reason?: string | null;
  createdAt: Date;
}

export interface WalletSummary {
  coins: number;
  pendingCoins: number;
  totalEarnedCoins: number;
  level: number;
  rank: string;
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
