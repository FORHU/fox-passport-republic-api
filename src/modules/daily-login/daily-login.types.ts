/** Why a citizen cannot claim right now; null when they can. */
export type DailyLoginBlock =
  "inactive" | "email_not_verified" | "no_attended_booking" | "cap_reached";

export interface DailyLoginStatus {
  /** Today (Manila) has already been claimed. */
  claimedToday: boolean;
  canClaim: boolean;
  reason: DailyLoginBlock | null;
  /** What today's claim pays, before the monthly cap trims it. */
  amount: number;
  /** What the next day's claim pays. */
  nextAmount: number;
  /** Days in a row claimed, counting today when claimed, else up to yesterday. */
  streak: number;
  /** Which day of the 7-day cycle today is (1 to 7), claimed or not. */
  cycleDay: number;
  /** What each of the seven days pays, day 1 first. */
  cycle: number[];
  monthlyCap: number;
  /** Tokens daily login has paid this Manila month. */
  monthlyEarned: number;
  /** When the next Manila day starts, as an ISO instant. */
  nextClaimAt: string;
}

export interface DailyLoginClaim {
  /** Tokens were paid by this call. */
  claimed: boolean;
  coinsAwarded: number;
  /** Today was claimed before this call; nothing more is paid. */
  alreadyClaimed: boolean;
  status: DailyLoginStatus;
}
