import { UserPath } from "@prisma/client";

export type AchievementCategory = "citizen" | "foxer";

export interface AchievementTier {
  tier: 1 | 2 | 3;
  target: number;
  xp: number;
  coins: number;
  badgeName?: string;
}

export interface AchievementDefinition {
  key: string;
  name: string;
  description: string;
  category: AchievementCategory;
  path: UserPath;
  tiers: [AchievementTier, AchievementTier, AchievementTier];
  isSocialOnly?: boolean; // Social achievements grant XP only (0 coins per §6.2)
}

export interface AchievementProgress {
  key: string;
  name: string;
  description: string;
  category: AchievementCategory;
  currentCount: number;
  currentTier: 0 | 1 | 2 | 3;
  nextTier: 1 | 2 | 3 | null;
  targetCount: number;
  progressPercentage: number;
  isCompleted: boolean;
  tiers: {
    tier: 1 | 2 | 3;
    target: number;
    xp: number;
    coins: number;
    badgeName?: string;
    isUnlocked: boolean;
  }[];
}

export interface UserAchievementsResponse {
  citizenAchievements: AchievementProgress[];
  foxerAchievements: AchievementProgress[];
  totalUnlockedTiers: number;
  completedAchievements: number;
}

