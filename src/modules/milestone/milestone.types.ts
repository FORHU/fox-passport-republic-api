import {
  ChallengeWindow,
  MilestoneCountMode,
  MilestoneCounter,
} from "@prisma/client";

export interface MilestoneTierProgress {
  tier: number;
  target: number;
  tokens: number;
  badgeName: string | null;
  isReached: boolean;
}

export interface MilestoneProgress {
  key: string;
  name: string;
  description: string | null;
  counter: MilestoneCounter;
  counts: MilestoneCountMode;
  /** "php" for Big Spender (whole pesos), "count" for everything else. */
  unit: "count" | "php";
  currentCount: number;
  /** Highest tier reached; 0 before the first. */
  currentTier: number;
  /** The next tier to reach, or null once the last is reached. */
  nextTier: number | null;
  /** Progress toward the next tier, 0 to 100; 100 once the last is reached. */
  progressPercentage: number;
  isCompleted: boolean;
  tiers: MilestoneTierProgress[];
}

export interface ChallengeProgress {
  key: string;
  name: string;
  description: string | null;
  period: ChallengeWindow;
  target: number;
  tokens: number;
  /** Qualifying bookings in the current period, capped at the target. */
  currentCount: number;
  isCompleted: boolean;
  /** The current period in Manila time, as ISO instants. */
  periodStart: string;
  periodEnd: string;
}

export interface MyMilestonesResponse {
  milestones: MilestoneProgress[];
  challenges: ChallengeProgress[];
}
