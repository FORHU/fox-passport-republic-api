import BookingRepo from "../repositories/booking.repository";
import EventRequestRepo from "../repositories/event-request.repository";
import PaymentSvc from "./payment.service";
import PaymentRepo from "../repositories/payment.repository";
import PayoutSvc from "./payout.service";
import { prisma } from "../utils/prisma";
import crypto from "crypto";
import {
  BookingStatus,
  ItemBookingStatus,
  EventCategory,
  InviteStatus,
  Prisma,
} from "@prisma/client";
import { can } from "../types/permissions";
import {
  announceToAdmins,
  announceToUser,
} from "../infrastructure/socket/invalidate";

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

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { specialRequests, ...bookingData } = rest;

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
      import("./passport.service")
        .then(({ default: PassportSvc, XP_REWARDS, UserPath }) => {
          return PassportSvc.awardXP(
            userId,
            UserPath.user,
            XP_REWARDS.bookEvent,
          );
        })
        .catch(() => {});

      return booking;
    }

    // ── Existing event-based booking path ────────────────────────────────
    if (!data.eventId) throw new Error("eventId is required");
    const event = await EventRequestRepo.findById(data.eventId);
    if (!event) throw new Error("Event not found");

    // early_bird: if template has publicOpenAt in the future, only early_bird holders can book
    const { default: PassportSvc } = await import("./passport.service");
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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    import("./passport.service")
      .then(({ default: P, XP_REWARDS, UserPath }) => {
        return P.awardXP(userId, UserPath.user, XP_REWARDS.bookEvent);
      })
      .catch(() => {});

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
    await PaymentRepo.cancelExpiredPayments();

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
    return BookingRepo.findAll(where, skip, limit);
  }

  static async getBookingById(id: string, userContext?: BookingViewerContext) {
    // Lazy cleanup
    await PaymentRepo.cancelExpiredPayments();
    const booking = await BookingRepo.findById(id);
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

    return BookingRepo.addAttendee(bookingId, {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      userId: data.userId,
      invitedById: inviterId,
      isDraft: true,
      ticketCode: `TKT-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
    });
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
    return BookingRepo.findByUserId(userId, skip, limit);
  }

  static async getUpcomingBookings(userId: string) {
    return BookingRepo.findUpcomingByUserId(userId);
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
    const isOrganizer = booking.event?.organizerId === requesterId;
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
        const PassportSvc = (await import("./passport.service")).default;
        await PassportSvc.issueStamp(id);
      } catch (err) {
        console.error(`Passport stamp failed for booking ${id}`, err);
      }
      // Award venueBooked XP to the venue owner + check VenueFoxer specialization
      import("./passport.service")
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
                await import("./specialization.service");
              SpecializationSvc.checkVenueFoxer(
                venueTx.venueId,
                venueTx.providerId,
              ).catch(() => {});
            }
          }
        })
        .catch(() => {});

      // Check EventFoxer specialization
      import("./specialization.service")
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

    const organizerId = booking.event?.organizerId;
    if (organizerId !== hostId) {
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
}
