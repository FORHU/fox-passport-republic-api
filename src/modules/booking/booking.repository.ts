import { prisma } from "../../utils/prisma";
import { Prisma, BookingStatus, PaymentStatus } from "@prisma/client";
import { BookingWithRelations } from "../../types/prisma.d";
import { bookingCache } from "../../utils/cache-namespaces";

export default class BookingRepo {
  /**
   * Retires the cached booking reads. Wrapped around **every** write below.
   *
   * `docs/REDIS-PLAN.md` §0 put caching in the services and kept it out of the
   * repositories, and read-through caching is still there. Invalidation is the
   * half that moved, because the two are not the same problem: a cache that
   * fills in the wrong place is a design smell, and a cache that is not retired
   * is a user seeing their own payment as unpaid.
   *
   * Scattering the bump across the services meant every future write had to
   * remember - and two of them already did not: the reminder cron and the
   * expiry sweep both wrote booking rows behind the services' backs. Here there
   * is nothing to remember. A write that reaches the database reaches this
   * line, because it is the same line.
   *
   * It bumps on writes that no cached read includes, which costs a colder
   * cache and buys never having to decide which those are.
   */
  private static async retiring<T>(write: Promise<T>): Promise<T> {
    const result = await write;
    await bookingCache.invalidateAll();
    return result;
  }

  static async create(data: Prisma.BookingCreateInput) {
    return this.retiring(
      prisma.booking.create({
        data,
        include: {
          event: true,
          user: { select: { name: true, email: true } },
          attendees: true,
        },
      }),
    );
  }

  /**
   * A booking created from ids already in hand, rather than through relations.
   *
   * Two callers outside this module were doing this against `prisma` directly:
   * the match flow, and - stranger - the review flow, which fabricates a
   * booking so that a review has something to hang off. See the flag in
   * `docs/REDIS-PLAN.md` §3 about that second one.
   */
  static async createWithIds(data: Prisma.BookingUncheckedCreateInput) {
    return this.retiring(prisma.booking.create({ data }));
  }

  /** `hasReview` is what hides the "leave a review" button. */
  static async setHasReview(id: string, hasReview: boolean) {
    return this.retiring(
      prisma.booking.update({ where: { id }, data: { hasReview } }),
    );
  }

  static async findAll(filters: Prisma.BookingWhereInput, skip = 0, take = 10) {
    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where: filters,
        include: {
          event: true,
          user: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.booking.count({ where: filters }),
    ]);
    return { bookings, total };
  }

  static async findById(id: string): Promise<BookingWithRelations | null> {
    return prisma.booking.findUnique({
      where: { id },
      include: {
        event: {
          include: {
            host: { select: { id: true, name: true, imgId: true } },
          },
        },
        user: { select: { id: true, name: true, email: true } },
        attendees: {
          include: {
            invitedBy: { select: { id: true, name: true } },
          },
        },
        payments: true,
        assetTransactions: true,
        serviceTransactions: true,
        venueTransactions: {
          include: {
            venue: true,
          },
        },
      },
    });
  }

  /**
   * The booking a cancellation has to reason about: every payment, and every
   * cancellation policy that could apply to it - the template's, and each
   * booked venue's and service's own.
   *
   * Moved out of the controller unchanged. It is deliberately the heaviest
   * read in the module and is not cached: it is loaded to decide a refund
   * percentage, and a stale answer there is money.
   */
  static async findForCancellation(id: string) {
    return prisma.booking.findUnique({
      where: { id },
      include: {
        payments: true,
        user: { select: { id: true, name: true, email: true } },
        event: {
          include: {
            template: {
              include: {
                cancellationPolicy: {
                  include: {
                    rules: { orderBy: { hoursBeforeEvent: "desc" } },
                  },
                },
              },
            },
            venueTransactions: {
              include: {
                venue: {
                  include: {
                    cancellationPolicy: {
                      include: {
                        rules: { orderBy: { hoursBeforeEvent: "desc" } },
                      },
                    },
                  },
                },
              },
            },
            serviceTransactions: {
              include: {
                service: {
                  include: {
                    cancellationPolicy: {
                      include: {
                        rules: { orderBy: { hoursBeforeEvent: "desc" } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  /** The host scans this at the door; the organiser id is what authorises them. */
  static async findByTicketCode(ticketCode: string) {
    return prisma.booking.findUnique({
      where: { ticketCode },
      include: { event: { select: { organizerId: true, name: true } } },
    });
  }

  /**
   * Separate from `findAttendeeByTicketCode` on purpose: this one carries the
   * booking and its event because the check-in path authorises against the
   * organiser, and `respondToInvite` - the other caller of that name - needs
   * neither and should not start loading them.
   */
  static async findAttendeeByTicketCodeForCheckIn(ticketCode: string) {
    return prisma.bookingAttendee.findUnique({
      where: { ticketCode },
      include: {
        booking: {
          include: { event: { select: { organizerId: true, name: true } } },
        },
      },
    });
  }

  /**
   * Start dates of the live bookings against every event built from a template.
   *
   * Two queries rather than a join through `event`, as it was written in the
   * controller: the id list is small and the shape is what the availability
   * calendar wants.
   */
  static async findBookedStartsByTemplate(templateId: string) {
    const events = await prisma.event.findMany({
      where: { templateId },
      select: { id: true },
    });

    return prisma.booking.findMany({
      where: {
        eventId: { in: events.map((e) => e.id) },
        status: { notIn: ["cancelled"] },
        startAt: { gte: new Date() },
      },
      select: { startAt: true },
    });
  }

  /**
   * What the Stripe webhook needs to know before it touches a booking.
   *
   * Narrow on purpose: the status and the existing intent id decide whether
   * either write happens at all, and the two ids are for the announcement -
   * this is the one handler with nobody in the room, and the browser that
   * started the payment is sitting on a page waiting for exactly this.
   */
  static async findPaymentContext(id: string) {
    return prisma.booking.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        stripePaymentId: true,
        userId: true,
        event: { select: { organizerId: true } },
      },
    });
  }

  static async setStripePaymentId(id: string, stripePaymentId: string) {
    return this.retiring(
      prisma.booking.update({ where: { id }, data: { stripePaymentId } }),
    );
  }

  static async markConfirmed(id: string) {
    return this.retiring(
      prisma.booking.update({
        where: { id },
        data: { status: BookingStatus.confirmed },
      }),
    );
  }

  /**
   * The writes the cancellation and confirmation flows do, which lived in
   * `booking.controller.ts` next to the Stripe calls that decided them.
   *
   * `cancel` and `markPaymentCancelled` are deliberately not `updateStatus`
   * above: that one returns the event and the user for an announcement these
   * paths make themselves, from a booking they have already loaded.
   */
  static async cancel(id: string) {
    return this.retiring(
      prisma.booking.update({
        where: { id },
        data: { status: BookingStatus.cancelled },
      }),
    );
  }

  static async markPaymentCancelled(paymentId: string) {
    return this.retiring(
      prisma.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.cancelled },
      }),
    );
  }

  static async markPaymentRefunded(paymentId: string) {
    return this.retiring(
      prisma.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.refunded },
      }),
    );
  }

  static async setPaymentTransaction(
    paymentId: string,
    data: { transactionId: string; method: string },
  ) {
    return this.retiring(
      prisma.payment.update({ where: { id: paymentId }, data }),
    );
  }

  static async createRefund(data: Prisma.RefundUncheckedCreateInput) {
    return this.retiring(prisma.refund.create({ data }));
  }

  static async markAttendeeCheckedIn(attendeeId: string) {
    return this.retiring(
      prisma.bookingAttendee.update({
        where: { id: attendeeId },
        data: { checkedIn: true },
      }),
    );
  }

  static async update(id: string, data: Prisma.BookingUncheckedUpdateInput) {
    return this.retiring(
      prisma.booking.update({
        where: { id },
        data,
        include: { attendees: true },
      }),
    );
  }

  static async addAttendee(
    bookingId: string,
    data: Prisma.BookingAttendeeUncheckedCreateWithoutBookingInput,
  ) {
    return this.retiring(
      prisma.bookingAttendee.create({
        data: {
          ...data,
          bookingId: bookingId,
        },
        include: {
          invitedBy: { select: { id: true, name: true } },
        },
      }),
    );
  }

  static async removeAttendee(attendeeId: string) {
    return this.retiring(
      prisma.bookingAttendee.delete({ where: { id: attendeeId } }),
    );
  }

  static async findAttendeeById(id: string) {
    return prisma.bookingAttendee.findUnique({
      where: { id },
      include: { booking: true },
    });
  }

  static async findAttendeeByTicketCode(ticketCode: string) {
    return prisma.bookingAttendee.findUnique({
      where: { ticketCode },
    });
  }

  static async updateAttendee(
    id: string,
    data: Prisma.BookingAttendeeUncheckedUpdateInput,
  ) {
    return this.retiring(
      prisma.bookingAttendee.update({ where: { id }, data }),
    );
  }

  static async finalizeAttendees(bookingId: string) {
    return this.retiring(
      prisma.$transaction([
        prisma.booking.update({
          where: { id: bookingId },
          data: { isGuestListLocked: true },
        }),
        prisma.bookingAttendee.updateMany({
          where: { bookingId, isDraft: true },
          data: { isDraft: false },
        }),
      ]),
    );
  }

  static async findByUserId(userId: string, skip = 0, take = 10) {
    const where = { userId };
    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: { event: true },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.booking.count({ where }),
    ]);
    return { bookings, total };
  }

  static async findUpcomingByUserId(userId: string) {
    return prisma.booking.findMany({
      where: {
        userId,
        status: { notIn: ["cancelled", "completed"] },
        startAt: { gte: new Date() },
      },
      include: { event: true },
      orderBy: { startAt: "asc" },
    });
  }

  /** Non-terminal bookings starting within the window that still need a reminder and/or payment nudge. */
  static async findUpcomingNeedingReminder(windowStart: Date, windowEnd: Date) {
    return prisma.booking.findMany({
      where: {
        startAt: { gte: windowStart, lte: windowEnd },
        status: { notIn: [BookingStatus.cancelled, BookingStatus.completed] },
        OR: [
          { reminderSentAt: null },
          { status: BookingStatus.pending, paymentReminderSentAt: null },
        ],
      },
      include: {
        event: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  /**
   * Claims a reminder before it is sent, rather than recording it after.
   *
   * The sweep runs on an in-process cron, so every API instance runs it. The
   * old sequence was read `reminderSentAt`, send, then mark - which two
   * instances can interleave: both read null, both send, both mark, and the
   * user gets the notification twice. The idempotency flag was real but the
   * check and the write were not atomic.
   *
   * `updateMany` with the null in the `where` makes the claim itself the race
   * winner: the database applies it to one row or none, and the loser is told
   * `count: 0` and sends nothing. No lock and no Redis - the row already
   * carries the state, it just was not being read and written as one step.
   *
   * Returns which of the two flags this caller won, so it sends only those.
   */
  static async claimReminders(
    id: string,
    want: { reminder: boolean; paymentReminder: boolean },
  ): Promise<{ reminder: boolean; paymentReminder: boolean }> {
    const now = new Date();

    // Separately, because they are independently claimable: one instance may
    // win the reminder while another wins the payment nudge, and a combined
    // update would make the pair all-or-nothing.
    const reminder = want.reminder
      ? (
          await this.retiring(
            prisma.booking.updateMany({
              where: { id, reminderSentAt: null },
              data: { reminderSentAt: now },
            }),
          )
        ).count > 0
      : false;

    const paymentReminder = want.paymentReminder
      ? (
          await this.retiring(
            prisma.booking.updateMany({
              where: { id, paymentReminderSentAt: null },
              data: { paymentReminderSentAt: now },
            }),
          )
        ).count > 0
      : false;

    return { reminder, paymentReminder };
  }

  /** Still-pending (unpaid) bookings whose event has already started. */
  static async findOverdueUnpaid(before: Date) {
    return prisma.booking.findMany({
      where: {
        status: BookingStatus.pending,
        startAt: { lt: before },
      },
      include: {
        event: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  // Mirrors asset-booking.repository.ts's updateStatus/confirmArrival/dispute exactly.
  static async updateStatus(id: string, status: BookingStatus) {
    return this.retiring(
      prisma.booking.update({
        where: { id },
        data: { status },
        include: {
          event: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
    );
  }

  static async confirmArrival(id: string) {
    return this.retiring(
      prisma.booking.update({
        where: { id },
        data: { status: BookingStatus.active },
        include: {
          event: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
    );
  }

  static async dispute(id: string) {
    return this.retiring(
      prisma.booking.update({
        where: { id },
        data: { status: BookingStatus.disputed },
        include: {
          event: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
    );
  }
}
