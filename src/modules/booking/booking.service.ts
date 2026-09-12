import Stripe from "stripe";
import BookingRepo from "./booking.repository";
import EventRepo from "../event/event.repository";
import EventRequestRepo from "../event-request/event-request.repository";
import EventOrganizerRepo from "../event-organizer/event-organizer.repository";
import EventTemplateSvc from "../event-template/event-template.service";
import PaymentSvc from "../payment/payment.service";
import PaymentRepo from "../payment/payment.repository";
import PayoutSvc from "../payout/payout.service";
import RefundSvc from "../refund/refund.service";
import WaitlistSvc from "../waitlist/waitlist.service";
import NotificationService from "../notifications/user-notification.service";
import { STRIPE_SECRET_KEY } from "../../config";
import { toStripeCents, formatCurrency } from "../../utils/pricing";
import { sendBookingCancelledEmail } from "../../utils/emails/cancellation";
import { sendBookingConfirmationEmail } from "../../utils/emails/confirmation";
import { prisma } from "../../utils/prisma";
import crypto from "crypto";
import {
  BookingStatus,
  ItemBookingStatus,
  EventCategory,
  InviteStatus,
  PaymentStatus,
  Prisma,
  RefundStatus,
  type Refund,
} from "@prisma/client";
import { can } from "../../types/permissions";
import { bookingCache } from "../../utils/cache-namespaces";
import { fingerprint } from "../../utils/cache.util";
import {
  announceAdminQueueChanged,
  announceToAdmins,
  announceToUser,
} from "../../infrastructure/socket/invalidate";

/*
 * Every cached booking read hangs off one version counter, and every write
 * bumps it - including the five in other modules, which is why the namespace
 * itself lives in `utils/cache-namespaces`.
 *
 * A booking is the most closely watched row in the product - a guest pays and
 * looks straight at it - so these reads cannot be left to expire. Nor can they
 * be invalidated by name: the list keys carry a page, a page size and a hash of
 * the caller's filters, so the write path cannot enumerate them. One counter
 * for the whole module means one thing to remember at a write instead of a map
 * of key shapes that rots the first time someone adds an endpoint.
 *
 * The cost is that any booking write cools every booking read, for everyone.
 * That is the deliberate trade: see `versionedCache` in `cache.util.ts`.
 */

/** Long, because a bump retires it anyway - see the note on TTLs below. */
const AVAILABILITY_TTL = 300;

/**
 * Short, and invalidated. The TTL is the floor on how wrong these can be if a
 * bump is ever missed, not the mechanism keeping them right.
 */
const BOOKING_TTL = 30;

/**
 * A booking is on three screens at once: the guest's, the host's, and the admin
 * Bookings tab. Announced from the service rather than the controllers because
 * `checkInAndSettle` reaches `updateStatus` without passing through one, and
 * every handler here has already loaded the booking to authorise the request.
 */
function announceBookingChanged(
  guestId: string | null | undefined,
  hostId: string | null | undefined,
) {
  announceToUser(guestId, "bookings");
  if (hostId && hostId !== guestId) announceToUser(hostId, "bookings");
  announceToAdmins("bookings");
}

/**
 * An error that already knows what the response should be.
 *
 * The handlers this service absorbed answered with 404, 409 and 403 directly,
 * and those distinctions are real - "no such ticket", "already checked in" and
 * "you are not the host" are three different things to the person holding the
 * phone. Mapping them from message text would have been the alternative, and
 * that is how `checkInBooking` used to do it. Mirrors `RoleAssignmentError`.
 */
export class BookingError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "BookingError";
  }
}

/**
 * A booking that did not exist a moment ago.
 *
 * Announced from here rather than from the controller, which is where it used
 * to happen - and so the draft-booking path, which shares `createBooking` and
 * never announced, now does too. That is the one behavioural difference the
 * extraction introduced: an extra socket ping telling a client to refetch a
 * list it is already looking at. `bookFromTemplate` announces again once its
 * escrow rows exist, because that is the point at which its booking is whole.
 */
function announceBookingCreated(userId: string) {
  announceAdminQueueChanged();
  announceToUser(userId, "bookings");
}

/** Attendee supplied when creating a booking or invited afterwards. */
export interface AttendeeInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  /** Set when the guest already has a platform account. */
  userId?: string;
}

/**
 * Payload accepted by `createBooking`. Two paths share this shape:
 *  - direct venue booking — `venueId` plus `startDate`/`endDate`
 *  - booking an existing event — `eventId`, dates come from the event
 *
 * That is why the date fields are optional here: neither path requires all of
 * them, and which subset is mandatory is enforced in the branch that uses it.
 */
export interface CreateBookingInput {
  userId: string;
  eventId?: string;
  venueId?: string;
  startDate?: string | Date;
  endDate?: string | Date;
  guestCount?: number;
  totalAmount?: number;
  currency?: string;
  specialRequests?: string;
  attendees?: AttendeeInput[];
}

/** Caller identity used for role-based visibility filtering. */
export interface BookingViewerContext {
  userId?: string;
  systemRole?: string;
}

export default class BookingSvc {
  /**
   * Retires every cached booking read.
   *
   * Almost nothing needs to call this any more: `BookingRepo` and `PaymentRepo`
   * retire the cache at the write itself, so anything that reaches the database
   * through them is already covered. What is left for this is a write in
   * *another* repository that changes what a cached booking read returns - the
   * escrow rows in `EventRepo`, today the only case.
   *
   * Awaited rather than fired off inside `announceBookingChanged`: the socket
   * announce is deliberately fire-and-forget, and an un-awaited bump racing the
   * client's immediate refetch is the exact staleness this exists to prevent.
   */
  static async invalidateCaches(): Promise<void> {
    await bookingCache.invalidateAll();
  }

  static async createBooking(data: CreateBookingInput) {
    const { attendees, eventId, venueId, startDate, endDate, userId, ...rest } =
      data;

    // ── Venue direct booking path ────────────────────────────────────────
    if (venueId && !eventId) {
      const venue = await prisma.venue.findUnique({
        where: { id: venueId },
        include: { mayor: true },
      });
      if (!venue) throw new Error("Venue not found");

      // A direct venue booking has no event to inherit dates from, so the
      // caller must supply them.
      if (!startDate || !endDate) {
        throw new Error("startDate and endDate are required to book a venue");
      }

      const startAt = new Date(startDate);
      const endAt = new Date(endDate);
      const days = Math.max(
        1,
        Math.ceil(
          (endAt.getTime() - startAt.getTime()) / (1000 * 60 * 60 * 24),
        ),
      );
      const rateMultiplier =
        venue.billingRate === "hourly"
          ? days * 24
          : venue.billingRate === "daily"
            ? days
            : venue.billingRate === "weekly"
              ? Math.ceil(days / 7)
              : venue.billingRate === "monthly"
                ? Math.ceil(days / 30)
                : 1;
      const itemsTotal = venue.price.mul(rateMultiplier);
      const platformFeeAmount = itemsTotal.mul(0.05);
      const totalAmount = data.totalAmount || itemsTotal.add(platformFeeAmount);

      // Create a minimal Event (no template — direct venue booking)
      const event = await prisma.event.create({
        data: {
          clientId: userId,
          organizerId: venue.mayorId,
          name: `${venue.name} Booking`,
          description: venue.description,
          eventCategory: EventCategory.other,
          startAt,
          endAt,
          guestCount: data.guestCount || 1,
          totalAmount,
          itemsTotal,
          hostMarkupAmount: 0,
          platformFeeAmount,
          requestStatus: "approved",
          eventStatus: "pending",
          targetCity: venue.city,
          targetState: venue.state,
          targetCountry: venue.country,
        },
      });

      // Create EventVenueTransaction
      await prisma.eventVenueTransaction.create({
        data: {
          eventId: event.id,
          venueId: venue.id,
          providerId: venue.mayorId,
          agreedPrice: itemsTotal,
          status: "pending",
          currency: "PHP",
        },
      });

      // Create Booking
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      // `specialRequests` is pulled out to keep it *off* bookingData, not to be
      // used. The `_` prefix is what marks a deliberate discard here.
      const { specialRequests: _specialRequests, ...bookingData } = rest;

      const booking = await BookingRepo.create({
        ...bookingData,
        guestCount: data.guestCount ?? 1,
        totalAmount,
        startAt,
        endAt,
        expiresAt,
        ticketCode: `BKG-${crypto.randomBytes(5).toString("hex").toUpperCase()}`,
        event: { connect: { id: event.id } },
        user: { connect: { id: userId } },
      });

      await PaymentSvc.createPayment({
        bookingId: booking.id,
        amount: Number(totalAmount),
        currency: data.currency ?? "PHP",
        method: "pending",
        paymentType: "full",
        expiresAt,
      });

      // Award bookEvent XP to the citizen who made the booking
      import("../passport/passport.service")
        .then(({ default: PassportSvc, XP_REWARDS, UserPath }) => {
          return PassportSvc.awardXP(
            userId,
            UserPath.user,
            XP_REWARDS.bookEvent,
          );
        })
        .catch(() => {});

      announceBookingCreated(userId);
      return booking;
    }

    // ── Existing event-based booking path ────────────────────────────────
    if (!data.eventId) throw new Error("eventId is required");
    const event = await EventRequestRepo.findById(data.eventId);
    if (!event) throw new Error("Event not found");

    // early_bird: if template has publicOpenAt in the future, only early_bird holders can book
    const { default: PassportSvc } =
      await import("../passport/passport.service");
    const template = event.template;
    if (
      template?.publicOpenAt &&
      new Date() < new Date(template.publicOpenAt)
    ) {
      const hasEarlyBird = await PassportSvc.hasPerk(userId, "early_bird");
      if (!hasEarlyBird) {
        const opensAt = new Date(template.publicOpenAt);
        throw new Error(
          `Bookings open on ${opensAt.toLocaleDateString()} — Early Bird members can book now`,
        );
      }
    }

    // priority_access: auto-confirm booking instead of leaving it pending
    const hasPriorityAccess = await PassportSvc.hasPerk(
      userId,
      "priority_access",
    );

    const attendeesWithTickets = (attendees ?? []).map((a) => ({
      ...a,
      invitedById: userId,
      isDraft: true,
      ticketCode: `TKT-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
    }));

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const totalAmount = data.totalAmount || 0;

    const { specialRequests: _, ...cleanRest } = rest;

    const booking = await BookingRepo.create({
      ...cleanRest,
      guestCount: data.guestCount ?? 1,
      totalAmount,
      startAt: event.startAt,
      endAt: event.endAt,
      expiresAt,
      ticketCode: `BKG-${crypto.randomBytes(5).toString("hex").toUpperCase()}`,
      ...(hasPriorityAccess ? { status: BookingStatus.confirmed } : {}),
      event: { connect: { id: data.eventId } },
      user: { connect: { id: userId } },
      attendees: { create: attendeesWithTickets },
    });

    await PaymentSvc.createPayment({
      bookingId: booking.id,
      amount: totalAmount,
      currency: data.currency || "PHP",
      method: "pending",
      paymentType: "full",
      expiresAt,
    });

    // Award bookEvent XP to the citizen who made the booking
    import("../passport/passport.service")
      .then(({ default: P, XP_REWARDS, UserPath }) => {
        return P.awardXP(userId, UserPath.user, XP_REWARDS.bookEvent);
      })
      .catch(() => {});

    announceBookingCreated(userId);
    return booking;
  }

  /**
   * Filters accepted from the query string.
   *
   * `filters` used to be the raw `req.query` spread straight into a Prisma
   * `where`. Express parses nested bracket syntax by default, so
   * `?user[email][contains]=@gmail.com` became a Prisma operator the caller
   * controlled — on an endpoint that also had no authentication and returned
   * every customer's name and email.
   *
   * An allow-list of scalars, coerced, is the whole fix for that half.
   */
  private static buildFilters(
    query: Record<string, unknown>,
  ): Prisma.BookingWhereInput {
    const where: Prisma.BookingWhereInput = {};

    const str = (v: unknown) => (typeof v === "string" ? v : undefined);

    const status = str(query.status);
    if (status && status in BookingStatus) {
      where.status = status as BookingStatus;
    }

    const eventId = str(query.eventId);
    if (eventId) where.eventId = eventId;

    const userId = str(query.userId);
    if (userId) where.userId = userId;

    const ticketCode = str(query.ticketCode);
    if (ticketCode) where.ticketCode = ticketCode;

    if (query.checkedIn === "true") where.checkedIn = true;
    if (query.checkedIn === "false") where.checkedIn = false;

    // `hostId` is not a column on Booking — the host is the event's organiser.
    // The client has been sending this for a while; unmapped it reached Prisma
    // as an unknown field.
    const hostId = str(query.hostId);
    if (hostId) where.event = { organizerId: hostId };

    return where;
  }

  /**
   * Bookings carry the customer's name and email, so this is scoped to what the
   * caller is party to. Admins see everything; anyone else sees bookings they
   * made or bookings on events they organise.
   *
   * The scope is applied with AND over the requested filters, so a filter
   * cannot widen it.
   */
  static async getAllBookings(
    query: Record<string, unknown>,
    page = 1,
    limit = 10,
    viewer?: BookingViewerContext,
  ) {
    await PaymentSvc.sweepExpiredPayments();

    const requested = this.buildFilters(query);

    let where: Prisma.BookingWhereInput = requested;
    if (!can(viewer?.systemRole, "bookings:read:all")) {
      if (!viewer?.userId) throw new Error("Unauthorized");
      where = {
        AND: [
          requested,
          {
            OR: [
              { userId: viewer.userId },
              { event: { organizerId: viewer.userId } },
            ],
          },
        ],
      };
    }

    const skip = (page - 1) * limit;

    // The `where` is caller-influenced and unbounded in length, so it is hashed
    // rather than spelled into the key. It already carries the viewer scope, so
    // two callers who share a key are entitled to the same rows - the hash is
    // the whole identity of the answer.
    return bookingCache.cached(
      `list:${fingerprint(where)}:${page}:${limit}`,
      BOOKING_TTL,
      () => BookingRepo.findAll(where, skip, limit),
    );
  }

  /**
   * Booked dates for a template's calendar.
   *
   * Shared - every visitor to the same template gets the same answer - and the
   * only read here that would be safe on a TTL alone. It is in the namespace
   * anyway, so a booking made now clears the calendar that still offers that
   * date, rather than leaving five minutes in which two people can both be told
   * it is free.
   */
  static async getAvailability(templateId: string) {
    return bookingCache.cached(
      `availability:${templateId}`,
      AVAILABILITY_TTL,
      async () => {
        const bookings =
          await BookingRepo.findBookedStartsByTemplate(templateId);

        return {
          bookedDates: [
            ...new Set(
              bookings.map((b) => b.startAt.toISOString().split("T")[0]),
            ),
          ],
        };
      },
    );
  }

  /**
   * The single booking behind the booking page.
   *
   * The expiry sweep stays outside the cache: it is a write, and skipping it on
   * a cache hit would leave expired payments pending for as long as the entry
   * lived. Only the read is cached.
   *
   * The viewer filtering below is applied *after* the cache, so one entry
   * serves the guest, the host and an admin - the key cannot depend on who is
   * asking without multiplying the entries by the audience.
   */
  static async getBookingById(id: string, userContext?: BookingViewerContext) {
    // Lazy cleanup
    await PaymentSvc.sweepExpiredPayments();
    const booking = await bookingCache.cached(`byId:${id}`, BOOKING_TTL, () =>
      BookingRepo.findById(id),
    );
    if (!booking) throw new Error("Booking not found");

    // Role-based visibility filtering
    const isOwner = booking.userId === userContext?.userId;
    const isHost = booking.event?.host?.id === userContext?.userId;
    const isAdmin = can(userContext?.systemRole, "bookings:read:all");

    if (isHost && !isAdmin && !isOwner) {
      // Host only sees finalized attendees
      booking.attendees = booking.attendees.filter((a) => !a.isDraft);
    }

    return booking;
  }

  /**
   * Three reads the controller used to do against `prisma` itself. They are
   * pass-throughs and stay that way until the writes around them move too - a
   * controller may not reach the repository, so they need a door here, and a
   * thin one is honest about how little shaping there is to do.
   *
   * None is cached. The first decides a refund amount, and the other two
   * authorise a door scan: all three are read to make a decision rather than to
   * fill a screen, and a bounded staleness is not acceptable in any of them.
   */
  static async getForCancellation(id: string) {
    return BookingRepo.findForCancellation(id);
  }

  static async getByTicketCode(ticketCode: string) {
    return BookingRepo.findByTicketCode(ticketCode);
  }

  static async getAttendeeByTicketCodeForCheckIn(ticketCode: string) {
    return BookingRepo.findAttendeeByTicketCodeForCheckIn(ticketCode);
  }

  static async addAttendee(
    bookingId: string,
    data: AttendeeInput,
    inviterId: string,
  ) {
    const booking = await BookingRepo.findById(bookingId);
    if (!booking) throw new Error("Booking not found");
    if (booking.isGuestListLocked) throw new Error("Guest list is locked");

    // Check for duplicates
    if (data.email) {
      const existing = booking.attendees.find((a) => a.email === data.email);
      if (existing) throw new Error("Guest with this email already invited");
    }

    const added = await BookingRepo.addAttendee(bookingId, {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      userId: data.userId,
      invitedById: inviterId,
      isDraft: true,
      ticketCode: `TKT-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
    });

    return added;
  }

  static async removeAttendee(attendeeId: string, userId: string) {
    const attendee = await BookingRepo.findAttendeeById(attendeeId);
    if (!attendee) throw new Error("Attendee not found");

    const booking = attendee.booking;
    if (booking.userId !== userId) throw new Error("Unauthorized");
    if (booking.isGuestListLocked) throw new Error("Guest list is locked");

    return BookingRepo.removeAttendee(attendeeId);
  }

  static async finalizeGuestList(bookingId: string, userId: string) {
    const booking = await BookingRepo.findById(bookingId);
    if (!booking) throw new Error("Booking not found");
    if (booking.userId !== userId) throw new Error("Unauthorized");

    await BookingRepo.finalizeAttendees(bookingId);
    return { message: "Guest list finalized and visible to host" };
  }

  static async respondToInvite(
    identifier: string,
    status: InviteStatus,
    userId?: string,
  ) {
    let attendee = await BookingRepo.findAttendeeByTicketCode(identifier);
    if (!attendee) {
      attendee = await BookingRepo.findAttendeeById(identifier);
    }

    if (!attendee) throw new Error("Attendee not found");

    return BookingRepo.updateAttendee(attendee.id, {
      inviteStatus: status,
      userId: userId || undefined,
    });
  }

  static async getUserBookings(userId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    return bookingCache.cached(
      `user:${userId}:${page}:${limit}`,
      BOOKING_TTL,
      () => BookingRepo.findByUserId(userId, skip, limit),
    );
  }

  static async getUpcomingBookings(userId: string) {
    return bookingCache.cached(`upcoming:${userId}`, BOOKING_TTL, () =>
      BookingRepo.findUpcomingByUserId(userId),
    );
  }

  static async cancelBooking(id: string, requesterId: string) {
    return this.updateStatus(id, "cancelled", requesterId);
  }

  // Mirrors asset-booking.service.ts's updateStatus/confirmArrival/dispute exactly,
  // giving the Event-flow Booking the same active/disputed lifecycle. This is also
  // the payout trigger point — see docs/adr/0002-stripe-connect-payouts.md.
  static async updateStatus(id: string, status: string, requesterId: string) {
    const booking = await BookingRepo.findById(id);
    if (!booking) throw new Error("Booking not found");

    const isOwner = booking.userId === requesterId;
    let isOrganizer = booking.event?.organizerId === requesterId;
    // A check-in delegate may only push a booking to `completed` (the status
    // check-in settles to) — never `cancelled` or anything else, which stay
    // the actual organizer's call alone. See EventOrganizerAssignment.
    if (
      !isOrganizer &&
      status === ItemBookingStatus.completed &&
      booking.event
    ) {
      isOrganizer = await EventOrganizerRepo.isAuthorized(
        booking.event.id,
        requesterId,
        "booking:check-in",
      );
    }
    if (!isOwner && !isOrganizer) throw new Error("Unauthorized");

    const updated = await BookingRepo.updateStatus(
      id,
      status as ItemBookingStatus,
    );

    if (status === ItemBookingStatus.completed) {
      // Payout failures must never fail the status-update response — log and move on.
      try {
        await PayoutSvc.createPayoutsForEventBooking(id);
      } catch (err) {
        console.error(`Payout failed for booking ${id}`, err);
      }
      try {
        const PassportSvc = (await import("../passport/passport.service"))
          .default;
        await PassportSvc.issueStamp(id);
      } catch (err) {
        console.error(`Passport stamp failed for booking ${id}`, err);
      }
      // Award venueBooked XP to the venue owner + check VenueFoxer specialization
      import("../passport/passport.service")
        .then(async ({ default: PassportSvc, XP_REWARDS, UserPath }) => {
          const venueTx = await prisma.eventVenueTransaction.findFirst({
            where: {
              eventId: booking.event?.id ?? booking.eventId,
            },
            select: { providerId: true, venueId: true },
          });
          if (venueTx?.providerId) {
            await PassportSvc.awardXP(
              venueTx.providerId,
              UserPath.venueFoxer,
              XP_REWARDS.venueBooked,
            );
            if (venueTx.venueId) {
              const { default: SpecializationSvc } =
                await import("../users/specialization.service");
              SpecializationSvc.checkVenueFoxer(
                venueTx.venueId,
                venueTx.providerId,
              ).catch(() => {});
            }
          }
        })
        .catch(() => {});

      // Check EventFoxer specialization
      import("../users/specialization.service")
        .then(async ({ default: SpecializationSvc }) => {
          const organizerId = booking.event?.organizerId;
          const eventCategory = booking.event?.eventCategory;
          if (organizerId && eventCategory) {
            await SpecializationSvc.checkEventFoxer(organizerId, eventCategory);
          }
        })
        .catch(() => {});
    }

    announceBookingChanged(booking.userId, booking.event?.organizerId);
    return updated;
  }

  // Host scans the booking QR at the door: mark checked-in AND immediately
  // settle the booking so the host (and all providers) receive their payout.
  // Reuses the existing payout trigger in updateStatus (status -> completed).
  static async checkInAndSettle(id: string, hostId: string) {
    const booking = await BookingRepo.findById(id);
    if (!booking) throw new Error("Booking not found");

    const isOrganizer = booking.event?.organizerId === hostId;
    const authorized =
      isOrganizer ||
      (booking.event
        ? await EventOrganizerRepo.isAuthorized(
            booking.event.id,
            hostId,
            "booking:check-in",
          )
        : false);
    if (!authorized) {
      throw new Error("Unauthorized — you are not the host of this event");
    }

    // Don't release a payout for an unpaid/cancelled booking.
    if (["pending", "cancelled"].includes(booking.status)) {
      throw new Error("Booking is not confirmed/paid yet");
    }

    // Already settled — idempotent, no re-payout.
    if (booking.status === ItemBookingStatus.completed) {
      return { booking, payoutTriggered: false, alreadySettled: true };
    }

    await BookingRepo.update(id, { checkedIn: true });
    await this.updateStatus(id, ItemBookingStatus.completed, hostId);

    return { booking: await BookingRepo.findById(id), payoutTriggered: true };
  }

  static async confirmArrival(id: string, requesterId: string) {
    const booking = await BookingRepo.findById(id);
    if (!booking) throw new Error("Booking not found");
    if (booking.userId !== requesterId)
      throw new Error("Only the client can confirm arrival");
    if (!["confirmed", "pending"].includes(booking.status)) {
      throw new Error("Booking cannot be confirmed at this stage");
    }
    const confirmed = await BookingRepo.confirmArrival(id);
    announceBookingChanged(booking.userId, booking.event?.organizerId);
    return confirmed;
  }

  static async dispute(id: string, requesterId: string) {
    const booking = await BookingRepo.findById(id);
    if (!booking) throw new Error("Booking not found");
    if (booking.userId !== requesterId)
      throw new Error("Only the client can report a dispute");
    if (["completed", "cancelled", "disputed"].includes(booking.status)) {
      throw new Error("Booking cannot be disputed at this stage");
    }
    const disputed = await BookingRepo.dispute(id);
    announceBookingChanged(booking.userId, booking.event?.organizerId);
    // The only way a row reaches the admin Disputes tab.
    announceToAdmins("disputes");
    return disputed;
  }

  // ─── FLOWS THAT LIVED IN THE CONTROLLER ───────────────────────────────────
  //
  // Three handlers held most of `booking.controller.ts`: a template booking, a
  // cancellation with refunds, and a payment confirmation. Each of them mixed
  // Stripe calls, escrow rows, emails, notifications and socket announcements
  // with the HTTP request they arrived on. They are here now, unchanged in
  // behaviour - see `docs/REDIS-PLAN.md` §0b.

  /**
   * Book directly from an approved template: create the event, the booking, and
   * one escrow row per included item.
   *
   * `totalAmount` is never taken from the client - it is computed from the
   * template's items, the host markup and the platform fee. See
   * `docs/adr/0001-host-markup-and-server-computed-event-total.md`.
   */
  static async bookFromTemplate(input: {
    userId: string;
    templateId: string;
    guestCount: number;
    startAt: Date;
    endAt: Date;
    excludedAssetIds?: string[];
    excludedServiceIds?: string[];
    excludedVenueIds?: string[];
  }) {
    const excludedAssetIds = input.excludedAssetIds ?? [];
    const excludedServiceIds = input.excludedServiceIds ?? [];
    const excludedVenueIds = input.excludedVenueIds ?? [];

    const template = await EventTemplateSvc.getPublicTemplateWithItemOwners(
      input.templateId,
    );
    if (!template) {
      throw new BookingError("Template not found or not approved", 404);
    }

    if (template.maxAttendees) {
      const currentAttendees = await WaitlistSvc.getCurrentAttendees(
        template.id,
      );
      if (currentAttendees >= template.maxAttendees) {
        throw new BookingError(
          "This event is at capacity. You can join the waitlist instead.",
          409,
          "AT_CAPACITY",
        );
      }
    }

    const { itemsTotal, hostMarkupAmount, platformFeeAmount, totalAmount } =
      EventTemplateSvc.calculateTotalsBreakdown(template, {
        excludedAssetIds,
        excludedServiceIds,
        excludedVenueIds,
      });

    const event = await EventRepo.createFromTemplate({
      templateId: template.id,
      clientId: input.userId,
      organizerId: template.ownerId,
      name: template.name,
      description: template.description ?? "",
      eventCategory: template.category,
      startAt: input.startAt,
      endAt: input.endAt,
      guestCount: input.guestCount,
      totalAmount,
      itemsTotal,
      hostMarkupAmount,
      platformFeeAmount,
      requestStatus: "approved",
      eventStatus: "pending",
      targetCity: template.targetCity ?? undefined,
      targetState: template.targetState ?? undefined,
      targetCountry: template.targetCountry ?? undefined,
    });

    const booking = await this.createBooking({
      userId: input.userId,
      eventId: event.id,
      guestCount: input.guestCount,
      totalAmount,
    });

    // Per-partner escrow transactions for all matched template items
    await EventRepo.createEscrowTransactions({
      assets: template.templateAssets
        .filter((ta) => ta.assetId && ta.asset?.ownerId)
        .map((ta) => ({
          eventId: event.id,
          bookingId: booking.id,
          assetId: ta.assetId!,
          providerId: ta.asset!.ownerId,
          quantity: ta.quantity,
          agreedPrice: ta.agreedPrice,
          included: !excludedAssetIds.includes(ta.id),
          status: "pending",
        })),
      services: template.templateServices
        .filter((ts) => ts.serviceId && ts.service?.ownerId)
        .map((ts) => ({
          eventId: event.id,
          bookingId: booking.id,
          serviceId: ts.serviceId!,
          providerId: ts.service!.ownerId,
          agreedPrice: ts.agreedPrice,
          included: !excludedServiceIds.includes(ts.id),
          status: "pending",
        })),
      venues: template.templateVenues
        .filter((tv) => tv.venueId && tv.venue?.mayorId)
        .map((tv) => ({
          eventId: event.id,
          bookingId: booking.id,
          venueId: tv.venueId!,
          providerId: tv.venue!.mayorId,
          agreedPrice: tv.agreedPrice,
          included: !excludedVenueIds.includes(tv.id),
          status: tv.matched ? "approved" : "pending",
        })),
    });

    // The one bump left in this service. `BookingRepo` retired the cache when
    // the booking was created - before these rows existed - and they were
    // written through `EventRepo`, which owns no booking cache.
    await this.invalidateCaches();
    announceToUser(input.userId, "bookings");

    return { booking, eventId: event.id };
  }

  /**
   * A citizen cancels: cancel the pending payments, refund the completed ones
   * according to whichever cancellation policy applies, and cancel the booking.
   *
   * The policy is the template's, or failing that the first booked venue's, or
   * failing that the first booked service's - the order the controller used.
   */
  static async cancelWithRefunds(id: string, requesterId: string) {
    const booking = await BookingRepo.findForCancellation(id);
    if (!booking) throw new Error("Booking not found");
    if (booking.userId !== requesterId) throw new Error("Unauthorized");
    if (booking.status === "cancelled")
      throw new Error("Booking is already cancelled");

    const stripe = new Stripe(STRIPE_SECRET_KEY || "", {
      apiVersion: "2025-08-27.basil",
    });

    const cancellationPolicy =
      booking.event.template?.cancellationPolicy ??
      booking.event.venueTransactions?.[0]?.venue?.cancellationPolicy ??
      booking.event.serviceTransactions?.[0]?.service?.cancellationPolicy;
    const { refundPercent, hoursUntilEvent, matchedRule } =
      RefundSvc.computeRefund(booking.startAt, cancellationPolicy);

    if (hoursUntilEvent <= 0) {
      throw new BookingError(
        "Event has already started — cancellation is no longer allowed",
        400,
      );
    }

    const policyName = cancellationPolicy?.name ?? null;
    const ruleDesc = matchedRule
      ? `${matchedRule.hoursBeforeEvent}h before = ${matchedRule.refundPercent}% refund`
      : null;
    const matchedRuleInfo = policyName
      ? `Policy: ${policyName} — ${ruleDesc ?? "no rule matched"}`
      : ruleDesc;

    const bookingPayments = await PaymentRepo.getBookingPayments(id);
    const completedPayments = bookingPayments.filter(
      (p) => p.status === PaymentStatus.paid,
    );
    const pendingPayments = bookingPayments.filter(
      (p) => p.status === PaymentStatus.pending,
    );

    for (const payment of pendingPayments) {
      if (payment.providerReference?.startsWith("pi_")) {
        try {
          await stripe.paymentIntents.cancel(payment.providerReference);
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (err) {
          // fall through
        }
      }

      await BookingRepo.markPaymentCancelled(payment.id);
    }

    const eventName = booking.event?.name ?? "Unknown Event";
    const userEmail = booking.user?.email;

    if (completedPayments.length === 0) {
      const updated = await BookingRepo.cancel(id);

      if (userEmail) {
        sendBookingCancelledEmail({
          to: userEmail,
          eventName,
          bookingId: id,
          startDate: booking.startAt?.toISOString() ?? "N/A",
          totalPaid: "PHP 0.00",
          refundAmount: "PHP 0.00",
          refundStatus: "No payment was collected",
        });
      }

      this.notifyBookingCancelled(booking, eventName, id);

      // Moves the guest's bookings, the host's, and the admin Bookings tab.
      // No `disputes` emit: nothing was paid, so no refund row was written.
      announceToUser(booking.userId, "bookings");
      announceToUser(booking.event?.organizerId, "bookings");
      announceToAdmins("bookings");

      await this.notifyWaitlist(booking.event?.templateId);

      return { booking: updated, refunds: [] as Refund[] };
    }

    const refunds: Refund[] = [];

    for (const payment of completedPayments) {
      let stripeRefundId: string | null = null;
      let refundStatus: RefundStatus = RefundStatus.pending;
      let failureReason: string | null = null;

      const estimatedRefund = payment.amount.mul(refundPercent).div(100);

      if (refundPercent <= 0) {
        refunds.push(
          await BookingRepo.createRefund({
            bookingId: id,
            paymentId: payment.id,
            amount: 0,
            providerReference: null,
            status: RefundStatus.succeeded,
            reason: matchedRuleInfo,
          }),
        );
        continue;
      }

      if (payment.providerReference?.startsWith("pi_")) {
        try {
          const refund = await stripe.refunds.create({
            payment_intent: payment.providerReference,
            amount: toStripeCents(estimatedRefund.toNumber()),
          });
          stripeRefundId = refund.id;
          refundStatus =
            refund.status === "succeeded"
              ? RefundStatus.succeeded
              : RefundStatus.pending;
          if (refund.status === "failed") {
            failureReason = refund.failure_reason ?? "Unknown Stripe error";
            refundStatus = RefundStatus.failed;
          }
        } catch (e: unknown) {
          const err = e as Error;
          stripeRefundId = null;
          refundStatus = RefundStatus.failed;
          failureReason = err.message ?? "Stripe refund failed";
        }
      }

      // No `failureReason`/`initiatedBy` columns on `Refund` any more —
      // logged for the record, not persisted; `reason` carries the policy
      // explanation, the one piece worth keeping on the row itself.
      if (failureReason) {
        console.error(
          `Refund failed for payment ${payment.id} (booking ${id}, requested by ${requesterId}): ${failureReason}`,
        );
      }

      const refund = await BookingRepo.createRefund({
        bookingId: id,
        paymentId: payment.id,
        amount: estimatedRefund,
        providerReference: stripeRefundId,
        status: refundStatus,
        reason: matchedRuleInfo,
      });

      if (refundStatus === "succeeded") {
        await BookingRepo.markPaymentRefunded(payment.id);
      }

      refunds.push(refund);
    }

    const updated = await BookingRepo.cancel(id);

    const totalPaid = completedPayments.reduce(
      (sum, p) => sum.add(p.amount),
      new Prisma.Decimal(0),
    );
    const totalRefunded = refunds.reduce(
      (sum, r) => sum.add(r.amount ?? 0),
      new Prisma.Decimal(0),
    );

    if (userEmail) {
      sendBookingCancelledEmail({
        to: userEmail,
        eventName,
        bookingId: id,
        startDate: booking.startAt?.toISOString() ?? "N/A",
        totalPaid: formatCurrency(totalPaid),
        refundAmount: formatCurrency(totalRefunded),
        refundStatus: refunds.some((r) => r.status === RefundStatus.failed)
          ? "Some refunds failed — contact support"
          : "Processed successfully",
      });
    }

    this.notifyBookingCancelled(booking, eventName, id);

    // As above, plus the refund rows this branch just wrote, which are what the
    // admin Disputes and Refunds tables are listing.
    announceToUser(booking.userId, "bookings");
    announceToUser(booking.event?.organizerId, "bookings");
    announceToAdmins("bookings");
    if (refunds.length > 0) announceToAdmins("disputes");

    await this.notifyWaitlist(booking.event?.templateId);

    return { booking: updated, refunds };
  }

  /** A cancelled booking may have freed a seat someone is queued for. */
  private static async notifyWaitlist(templateId: string | null | undefined) {
    if (!templateId) return;
    try {
      await WaitlistSvc.notifyFirstInLine(templateId);
    } catch (err) {
      console.error("Failed to notify waitlist after cancellation:", err);
    }
  }

  /**
   * In-app notifications mirroring the booking-cancelled email: the guest who
   * booked, and the host or organizer.
   */
  private static notifyBookingCancelled(
    booking: {
      user?: { id: string } | null;
      event?: {
        host?: { id: string } | null;
        organizerId?: string | null;
      } | null;
    } | null,
    eventName: string,
    bookingId: string,
  ) {
    const guestId = booking?.user?.id;
    const hostId = booking?.event?.host?.id ?? booking?.event?.organizerId;

    if (guestId) {
      NotificationService.create({
        userId: guestId,
        type: "BOOKING_CANCELLED",
        title: "Booking cancelled",
        message: `Your booking for ${eventName} has been cancelled.`,
        metadata: { link: `/bookings/${bookingId}` },
      }).catch((e) => console.error("Failed to create guest notification", e));
    }

    if (hostId && hostId !== guestId) {
      NotificationService.create({
        userId: hostId,
        type: "BOOKING_CANCELLED",
        title: "Booking cancelled",
        message: `The booking for ${eventName} has been cancelled.`,
        metadata: { link: `/host/bookings/${bookingId}` },
      }).catch((e) => console.error("Failed to create host notification", e));
    }
  }

  /**
   * The client reports a completed Stripe payment.
   *
   * Three shapes arrive here: the transaction already exists (Stripe retried,
   * or the client did), there is a pending payment to complete, or there is
   * neither and the payment has to be created outright. Keeping them apart is
   * what avoids a unique-constraint collision on `transactionId` and preserves
   * the deposit -> full payment transition.
   */
  static async confirmPayment(
    bookingId: string,
    input: { amount: number; method: string; transactionId: string },
    viewer: { userId: string; email?: string; systemRole?: string },
  ) {
    const payments = await PaymentSvc.getBookingPayments(bookingId);
    const pendingPayment = payments.find(
      (p) => p.status === PaymentStatus.pending,
    );
    const existingTransaction = payments.find(
      (p) => p.providerReference === input.transactionId,
    );

    let payment;
    const looksLikeStripeId =
      String(input.transactionId).startsWith("pi_") ||
      input.method === "stripe";

    if (existingTransaction) {
      if (existingTransaction.status !== PaymentStatus.paid) {
        await PaymentSvc.updatePayment(existingTransaction.id, {
          paymentStatus: PaymentStatus.paid,
        });
      }

      await this.linkStripePayment(
        bookingId,
        input.transactionId,
        looksLikeStripeId,
      );
      payment = await PaymentSvc.getPaymentById(existingTransaction.id);
    } else if (pendingPayment) {
      // mark pending payment as completed
      await PaymentSvc.updatePayment(pendingPayment.id, {
        paymentStatus: PaymentStatus.paid,
      });
      // set the transaction id to the one provided by client
      await BookingRepo.setPaymentTransaction(pendingPayment.id, {
        transactionId: input.transactionId,
        method: input.method,
      });
      await this.linkStripePayment(
        bookingId,
        input.transactionId,
        looksLikeStripeId,
      );
      // Re-fetch payment so the included booking reflects the updated
      // stripePaymentId
      payment = await PaymentSvc.getPaymentById(pendingPayment.id);
    } else {
      // No pending payment found — create a fresh completed payment record
      payment = await PaymentSvc.createPayment({
        bookingId,
        amount: input.amount,
        currency: "PHP",
        method: input.method,
        paymentType: "full",
        paymentStatus: PaymentStatus.paid,
        transactionId: input.transactionId,
      });

      await this.linkStripePayment(
        bookingId,
        input.transactionId,
        looksLikeStripeId,
      );
      // Ensure returned payment includes latest booking data
      payment = await PaymentSvc.getPaymentById(payment.id);
    }

    // No bump here: every write above went through `PaymentRepo` or
    // `BookingRepo`, both of which retire the cache before they return. That
    // ordering is what makes the read below safe, and it is the reason the
    // invalidation moved to the write - this is the one place a stale answer is
    // worst, and it used to depend on remembering a line.
    const booking = await this.getBookingById(bookingId, viewer);

    // Send booking confirmation email (fire-and-forget)
    try {
      const userEmail = viewer.email || booking.user?.email;
      const eventName = booking.event?.name ?? "Your Booking";
      const venueName =
        booking.venueTransactions?.find((vt) => vt.included)?.venue?.name ??
        booking.venueTransactions?.[0]?.venue?.name ??
        booking.event?.name ??
        "Venue";
      if (userEmail) {
        sendBookingConfirmationEmail({
          to: userEmail,
          eventName,
          bookingId,
          // Already an ISO string: this read is cached, so its dates have been
          // through JSON. The cancellation path above is not cached and still
          // converts.
          startDate: booking.startAt ?? "N/A",
          totalPaid: formatCurrency(input.amount),
          venueName,
        });
      }

      // In-app notification (guest + host), mirroring the confirmation email
      const guestId = viewer.userId;
      const hostId = booking.event?.host?.id as string | undefined;
      NotificationService.create({
        userId: guestId,
        type: "BOOKING_CONFIRMED",
        title: "Booking confirmed",
        message: `Your booking for ${eventName} is confirmed.`,
        metadata: { link: `/bookings/${bookingId}` },
      }).catch((e) => console.error("Failed to create guest notification", e));

      if (hostId && hostId !== guestId) {
        NotificationService.create({
          userId: hostId,
          type: "BOOKING_CONFIRMED",
          title: "New booking",
          message: `You have a new confirmed booking for ${eventName}.`,
          metadata: { link: `/host/bookings/${bookingId}` },
        }).catch((e) => console.error("Failed to create host notification", e));
      }
    } catch (emailErr) {
      console.error("Failed to send booking confirmation email:", emailErr);
    }

    // Outside the try above on purpose: a mail provider having a bad minute
    // must not also cost the guest and host their invalidation.
    const eventHostId = booking.event?.host?.id as string | undefined;
    announceToUser(viewer.userId, "bookings");
    if (eventHostId && eventHostId !== viewer.userId)
      announceToUser(eventHostId, "bookings");
    announceToAdmins("bookings");

    return { booking, payment };
  }

  /** Idempotent, and never fatal: the payment itself is already recorded. */
  private static async linkStripePayment(
    bookingId: string,
    transactionId: string,
    looksLikeStripeId: boolean,
  ) {
    if (!looksLikeStripeId) return;
    try {
      await BookingRepo.setStripePaymentId(bookingId, transactionId);
    } catch (err) {
      console.error(
        "Failed to set booking.stripePaymentId during confirmBooking:",
        err,
      );
    }
  }

  /** The organiser id — or a delegated event organizer — authorises a scan. */
  static async checkInByTicketCode(ticketCode: string, hostId: string) {
    const booking = await BookingRepo.findByTicketCode(ticketCode);
    if (!booking) throw new BookingError("Invalid ticket code", 404);

    const isOrganizer = booking.event?.organizerId === hostId;
    const authorized =
      isOrganizer ||
      (booking.event
        ? await EventOrganizerRepo.isAuthorized(
            booking.event.id,
            hostId,
            "booking:check-in",
          )
        : false);
    if (!authorized) {
      throw new BookingError(
        "Unauthorized — you are not the host of this event",
        403,
      );
    }

    return this.checkInAndSettle(booking.id, hostId);
  }

  /** Host or a delegated event organizer scans a guest's QR at the door. */
  static async checkInAttendeeByTicketCode(ticketCode: string, hostId: string) {
    const attendee =
      await BookingRepo.findAttendeeByTicketCodeForCheckIn(ticketCode);
    if (!attendee) throw new BookingError("Invalid ticket code", 404);

    const isOrganizer = attendee.booking.event?.organizerId === hostId;
    const authorized =
      isOrganizer ||
      (attendee.booking.event
        ? await EventOrganizerRepo.isAuthorized(
            attendee.booking.event.id,
            hostId,
            "booking:check-in",
          )
        : false);
    if (!authorized) {
      throw new BookingError(
        "Unauthorized — you are not the host of this event",
        403,
      );
    }

    if (attendee.checkedIn) {
      throw new BookingError("Attendee already checked in", 409);
    }

    const updated = await BookingRepo.markAttendeeCheckedIn(attendee.id);

    // The host's door list and the guest's own booking both show this. No admin
    // emit: the admin Bookings tab lists bookings, not attendees.
    announceToUser(hostId, "bookings");
    announceToUser(attendee.booking.userId, "bookings");

    return updated;
  }

  /** Bulk invite, one attendee at a time so a bad row fails only itself. */
  static async addAttendees(
    bookingId: string,
    attendees: AttendeeInput[],
    inviterId: string,
  ) {
    const results = [];
    for (const attendee of attendees) {
      results.push(await this.addAttendee(bookingId, attendee, inviterId));
    }
    return results;
  }
}
