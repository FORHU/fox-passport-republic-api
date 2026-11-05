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
