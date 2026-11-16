/** What a citizen sees of their own referrals. */
export interface MyReferral {
  /** The code to share. Made the first time it is asked for. */
  code: string;
  /** Friends who have attached this person's code. */
  referred: number;
  /** Of those, how many have paid out. Stays 0 until the payout ships. */
  rewarded: number;
  /** Someone's code is already attached to this account. */
  hasReferrer: boolean;
  /** This account can still enter a code: none yet, and no paid booking yet. */
  canApplyCode: boolean;
}

export interface ApplyReferralResult {
  /** A code pays nothing at sign-up: it waits for the first attended booking. */
  status: "pending";
}
