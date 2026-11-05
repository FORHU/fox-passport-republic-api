/**
 * Marks a system-generated voucher — never surfaced to a citizen, never
 * typed by anyone, just the redemption anchor an auto-apply promotion needs
 * so it can reuse the ordinary Voucher/VoucherRedemption limit-checking
 * machinery instead of a second one.
 *
 * Shared by the service (which mints these) and the repository (which keeps
 * them out of every list a person sees), so the two can't drift apart.
 */
export const AUTO_APPLY_CODE_PREFIX = "AUTO";
