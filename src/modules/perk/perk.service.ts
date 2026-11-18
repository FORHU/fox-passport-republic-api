import { AppError, notFound } from "../../utils/errors";
import RewardRepo from "../reward/reward.repository";
import PerkRepo, { PerkRedeemError } from "./perk.repository";
import {
  newPerkCode,
  newPerkSecret,
  liveCode,
  secondsLeftInWindow,
} from "./perk.code";
import { PerkRedemptionStatus } from "./perk.constants";

type PerkRow = NonNullable<Awaited<ReturnType<typeof PerkRepo.findPerk>>>;

/** A perk as the app lists it. `tokensShort` is how many Tokens it is out of reach by. */
function toPerkDto(perk: PerkRow, balance: number) {
  return {
    id: perk.id,
    issuerType: perk.issuerType,
    venueId: perk.venueId,
    templateId: perk.templateId,
    title: perk.title,
    description: perk.description,
    worthPhp: Number(perk.worthPhp),
    tokenCost: perk.tokenCost,
    remaining: perk.remaining,
    validDays: perk.validDays,
    tokensShort: Math.max(0, perk.tokenCost - balance),
  };
}

export default class PerkSvc {
  /** Perks on offer, with what the person can spend and what is held back. */
  static async list(userId: string) {
    const [perks, balance, held] = await Promise.all([
      PerkRepo.listOffered(),
      RewardRepo.getCoinsBalance(userId),
      RewardRepo.getPendingCoins(userId),
    ]);
    return {
      balance,
      held,
      perks: perks.map((p) => toPerkDto(p, balance)),
    };
  }

  /** One perk, and the bookings the person could use it on. */
  static async detail(userId: string, perkId: string, now = new Date()) {
    const perk = await PerkRepo.findPerk(perkId);
    if (!perk || !perk.active) throw notFound("Perk");
    const [balance, bookings, held] = await Promise.all([
      RewardRepo.getCoinsBalance(userId),
      PerkRepo.findEligibleBookings(userId, perk, now),
      PerkRepo.findHeld(userId),
    ]);
    const taken = new Set(
      held.filter((h) => h.perkId === perk.id).map((h) => h.bookingId),
    );
    return {
      balance,
      perk: toPerkDto(perk, balance),
      bookings: bookings
        .filter((b) => !taken.has(b.id))
        .map((b) => ({
          id: b.id,
          name: b.event.name,
          startAt: b.startAt,
        })),
    };
  }

  /**
   * Spends the Tokens on a perk for one of the person's bookings and issues
   * its code, valid for the perk's days. The booking must be theirs, still
   * ahead of them and at the perk's venue or event; held Tokens are not
   * spendable (only the spendable balance is read).
   */
  static async redeem(
    userId: string,
    perkId: string,
    bookingId: string,
    now = new Date(),
  ) {
    const perk = await PerkRepo.findPerk(perkId);
    if (!perk || !perk.active) throw notFound("Perk");
    if (perk.remaining !== null && perk.remaining <= 0) {
      throw new AppError("That perk is sold out.", 409, "PERK_SOLD_OUT");
    }

    const booking = await PerkRepo.findBookingOf(userId, bookingId);
    if (!booking) throw notFound("Booking");
    const eligible = await PerkRepo.findEligibleBookings(userId, perk, now);
    if (!eligible.some((b) => b.id === booking.id)) {
      throw new AppError(
        "This perk does not work for that booking.",
        400,
        "PERK_BOOKING_NOT_ELIGIBLE",
      );
    }

    const code = newPerkCode();
    const secret = newPerkSecret();
    const expiresAt = new Date(now.getTime() + perk.validDays * 86_400_000);
    try {
      const { redemption, remainingCoins } = await PerkRepo.redeemTransaction({
        userId,
        perk: {
          id: perk.id,
          title: perk.title,
          tokenCost: perk.tokenCost,
          quantity: perk.quantity,
        },
        bookingId: booking.id,
        code,
        secret,
        expiresAt,
      });
      return {
        redemptionId: redemption.id,
        code: redemption.code,
        tokensSpent: redemption.tokensSpent,
        remainingCoins,
        expiresAt: redemption.expiresAt,
      };
    } catch (err) {
      if (err instanceof PerkRedeemError) {
        if (err.reason === "sold_out") {
          throw new AppError("That perk is sold out.", 409, "PERK_SOLD_OUT");
        }
        if (err.reason === "already") {
          throw new AppError(
            "You already have this perk for that booking.",
            409,
            "PERK_ALREADY_REDEEMED",
          );
        }
        throw new AppError(
          "Not enough Tokens to redeem this perk.",
          400,
          "INSUFFICIENT_TOKENS",
        );
      }
      throw err;
    }
  }

  /** The person's perks: ready, used, and returned (expired or cancelled). */
  static async mine(userId: string, now = new Date()) {
    const rows = await PerkRepo.listMine(userId);
    return rows.map((r) => ({
      id: r.id,
      perkId: r.perkId,
      title: r.perk.title,
      venueId: r.perk.venueId,
      bookingId: r.bookingId,
      tokensSpent: r.tokensSpent,
      status: r.status,
      // A ready perk past its date is reported as expired until the sweep
      // returns the Tokens.
      expired: r.status === PerkRedemptionStatus.ready && r.expiresAt <= now,
      expiresAt: r.expiresAt,
      usedAt: r.usedAt,
      createdAt: r.createdAt,
    }));
  }

  /**
   * The code to show at the door: the text code and the live value that
   * changes every 30 seconds. Only for the owner, and only while it is ready
   * and not past its date.
   */
  static async code(userId: string, redemptionId: string, now = new Date()) {
    const r = await PerkRepo.findRedemption(redemptionId);
    if (!r || r.userId !== userId) throw notFound("Perk");
    if (r.status !== PerkRedemptionStatus.ready || r.expiresAt <= now) {
      throw new AppError(
        "This perk can no longer be used.",
        409,
        "PERK_NOT_READY",
      );
    }
    return {
      code: r.code,
      live: liveCode(r.codeSecret, r.code, now),
      refreshInSeconds: secondsLeftInWindow(now),
      title: r.perk.title,
      expiresAt: r.expiresAt,
    };
  }

  /**
   * Hourly: gives back the Tokens of every ready perk that has expired or
   * whose booking was cancelled. Idempotent per perk; one failure is logged
   * and does not stop the rest.
   */
  static async returnDue(now = new Date()) {
    const ready = await PerkRepo.findReady();
    const cancelled = await PerkRepo.findCancelledBookingIds(
      ready.map((r) => r.bookingId),
    );
    let returned = 0;
    let tokens = 0;
    let failed = 0;
    for (const r of ready) {
      const why = cancelled.has(r.bookingId)
        ? ("booking_cancelled" as const)
        : r.expiresAt <= now
          ? ("expired" as const)
          : null;
      if (!why) continue;
      try {
        const done = await PerkRepo.returnRedemption({
          redemptionId: r.id,
          userId: r.userId,
          tokens: r.tokensSpent,
          code: r.code,
          why,
        });
        if (done) {
          returned += 1;
          tokens += r.tokensSpent;
        }
      } catch (err) {
        failed += 1;
        console.error(`[PerkSvc] perk return failed for ${r.id}`, err);
      }
    }
    return { returned, tokens, failed };
  }
}
