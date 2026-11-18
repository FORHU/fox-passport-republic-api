import { AppError, notFound } from "../../utils/errors";
import RewardRepo from "../reward/reward.repository";
import PerkRepo, { PerkRedeemError } from "./perk.repository";
import AppointmentAccess, {
  isEventOwner,
  isVenueMayor,
} from "../appointment/appointment.access";
import {
  newPerkCode,
  newPerkSecret,
  liveCode,
  secondsLeftInWindow,
  verifyLiveCode,
} from "./perk.code";
import {
  PerkIssuer,
  PerkRedemptionStatus,
  TOKENS_PER_PESO,
} from "./perk.constants";

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
  /**
   * Perks on offer, with what the person can spend and what is held back;
   * only the ones for `eventId` when it is given.
   */
  static async list(userId: string, eventId?: string) {
    const [perks, balance, held] = await Promise.all([
      PerkRepo.listOffered(eventId),
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
   * An Event Foxer offers a perk on their own event, or a Mayor on their own
   * venue: what it is, what it is worth in pesos, how many. The Token price
   * is set from the peso value (5 Tokens = 1 peso), so it is fair at every
   * event. The offerer provides it, so it costs them, not the platform.
   */
  static async create(
    userId: string,
    input: {
      eventId?: unknown;
      venueId?: unknown;
      title?: unknown;
      description?: unknown;
      worthPhp?: unknown;
      quantity?: unknown;
    },
    now = new Date(),
  ) {
    const eventId = typeof input.eventId === "string" ? input.eventId : null;
    const venueId = typeof input.venueId === "string" ? input.venueId : null;
    if ((eventId === null) === (venueId === null)) {
      throw new AppError("Give an eventId or a venueId, not both.", 400);
    }
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (title.length < 1 || title.length > 80) {
      throw new AppError("The title must be 1 to 80 characters.", 400);
    }
    const description =
      typeof input.description === "string" && input.description.trim() !== ""
        ? input.description.trim()
        : null;
    if (description !== null && description.length > 280) {
      throw new AppError("The description is at most 280 characters.", 400);
    }
    const worth = Number(input.worthPhp);
    if (!Number.isFinite(worth) || worth <= 0 || worth > 100_000) {
      throw new AppError("The worth must be above 0 and at most 100000.", 400);
    }
    const quantity = Number(input.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10_000) {
      throw new AppError("How many must be a whole number, 1 to 10000.", 400);
    }
    const tokenCost = Math.max(1, Math.round(worth * TOKENS_PER_PESO));

    if (eventId !== null) {
      const event = await PerkRepo.findEventForOffer(eventId);
      if (!event || !isEventOwner(event, userId)) throw notFound("Event");
      if (event.endAt <= now) {
        throw new AppError("That event is over.", 400, "EVENT_OVER");
      }
    } else {
      const venue = await PerkRepo.findVenueForOffer(venueId as string);
      if (!venue || !isVenueMayor(venue, userId)) throw notFound("Venue");
    }

    const perk = await PerkRepo.createPerk({
      issuerType: eventId !== null ? PerkIssuer.host : PerkIssuer.venue,
      issuerUserId: userId,
      eventId,
      venueId,
      title,
      description,
      worthPhp: worth,
      tokenCost,
      quantity,
    });
    return toPerkDto(perk, 0);
  }

  /** The perks a person offers, with how many were bought and what is left. */
  static async listIssued(userId: string) {
    const perks = await PerkRepo.listIssued(userId);
    return perks.map((p) => ({
      ...toPerkDto(p, 0),
      active: p.active,
      quantity: p.quantity,
      redeemed: p._count.redemptions,
    }));
  }

  /**
   * The offerer takes a perk down: the offer stops, and everyone still
   * holding it unused gets their Tokens back. Safe to repeat: a second call
   * returns whatever the first one did not reach.
   */
  static async takeDown(userId: string, perkId: string) {
    const perk = await PerkRepo.findPerk(perkId);
    if (!perk || perk.issuerUserId !== userId) throw notFound("Perk");
    await PerkRepo.deactivate(perk.id);

    const holders = await PerkRepo.findReadyForPerk(perk.id);
    let returned = 0;
    let tokens = 0;
    for (const h of holders) {
      const done = await PerkRepo.returnRedemption({
        redemptionId: h.id,
        userId: h.userId,
        tokens: h.tokensSpent,
        code: h.code,
        why: "perk_removed",
      });
      if (done) {
        returned += 1;
        tokens += h.tokensSpent;
      }
    }
    return { perkId: perk.id, returned, tokens };
  }

  /**
   * May this person check and use a perk? The people who may check the
   * booking in: the event's owner, its check-in helpers and (on the day) the
   * venue's staff, or, for a venue's own perk, that venue's Mayor and staff.
   */
  private static async canScan(
    scannerId: string,
    perk: { venueId: string | null },
    eventId: string | null,
  ): Promise<boolean> {
    if (
      await AppointmentAccess.canOnEvent(eventId, scannerId, "booking:check-in")
    ) {
      return true;
    }
    return perk.venueId
      ? AppointmentAccess.canOnVenue(
          perk.venueId,
          scannerId,
          "booking:check-in",
        )
      : false;
  }

  /**
   * Venue staff check a perk code at the door: a scanned live code (which
   * must be from the last minute, so a screenshot fails) or a typed code.
   * Says whether it is valid, already used (when and where) or expired.
   */
  static async check(
    scannerId: string,
    input: { code?: unknown; live?: unknown },
    now = new Date(),
  ) {
    const raw =
      typeof input.live === "string" && input.live !== ""
        ? input.live.trim()
        : typeof input.code === "string"
          ? input.code.trim()
          : "";
    if (raw === "") throw new AppError("A code is required.", 400);
    const code = raw.split(".")[0].toUpperCase();
    const redemption = await PerkRepo.findByCode(code);
    if (!redemption) {
      throw new AppError("No perk matches that code.", 404, "PERK_NOT_FOUND");
    }
    const booking = await PerkRepo.findBookingForCheck(redemption.bookingId);
    if (
      !(await this.canScan(
        scannerId,
        redemption.perk,
        booking?.eventId ?? null,
      ))
    ) {
      throw new AppError("You cannot check this perk.", 403);
    }
    // A scanned code carries a signature; a typed one does not.
    if (
      raw.includes(".") &&
      !verifyLiveCode(redemption.codeSecret, redemption.code, raw, now)
    ) {
      throw new AppError(
        "That code has expired. Ask the guest to refresh it.",
        409,
        "PERK_CODE_STALE",
      );
    }

    const result =
      redemption.status === PerkRedemptionStatus.used
        ? ("used" as const)
        : redemption.status === PerkRedemptionStatus.returned ||
            redemption.expiresAt <= now
          ? ("expired" as const)
          : ("valid" as const);
    return {
      result,
      redemptionId: redemption.id,
      perk: { title: redemption.perk.title },
      guestFirstName: redemption.user.name.trim().split(/\s+/)[0] ?? "",
      booking: booking
        ? { name: booking.event.name, startAt: booking.startAt }
        : null,
      validUntil: redemption.expiresAt,
      usedAt: redemption.usedAt,
      venueName: redemption.perk.venueId
        ? await PerkRepo.findVenueName(redemption.perk.venueId)
        : null,
    };
  }

  /** Staff mark a checked perk used, once; a second try is refused. */
  static async markUsed(
    scannerId: string,
    redemptionId: string,
    now = new Date(),
  ) {
    const redemption = await PerkRepo.findRedemption(redemptionId);
    if (!redemption) throw notFound("Perk");
    const booking = await PerkRepo.findBookingForCheck(redemption.bookingId);
    if (
      !(await this.canScan(
        scannerId,
        redemption.perk,
        booking?.eventId ?? null,
      ))
    ) {
      throw new AppError("You cannot use this perk.", 403);
    }
    const done = await PerkRepo.markUsed(redemption.id, scannerId, now);
    if (!done) {
      const used = redemption.status === PerkRedemptionStatus.used;
      throw new AppError(
        used ? "Already used." : "This perk can no longer be used.",
        409,
        used ? "PERK_ALREADY_USED" : "PERK_NOT_READY",
      );
    }
    return { redemptionId: redemption.id, usedAt: now };
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
