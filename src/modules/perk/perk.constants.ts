/** 5 Tokens = 1 peso: the same rate the booking-fee budget uses. */
export const TOKENS_PER_PESO = 5;

/** The live code changes every this many seconds, so a screenshot goes stale. */
export const CODE_WINDOW_SECONDS = 30;

/** A perk's lifecycle on a redemption. */
export const PerkRedemptionStatus = {
  ready: "ready",
  used: "used",
  /** Expired unused, or its booking was cancelled: the Tokens came back. */
  returned: "returned",
} as const;

/** Who provides a perk, and so who pays for it. */
export const PerkIssuer = {
  venue: "venue",
  host: "host",
  platform: "platform",
} as const;

/** Bookings that can still have a perk used on them. */
export const USABLE_BOOKING_STATUSES = ["confirmed", "active"] as const;
