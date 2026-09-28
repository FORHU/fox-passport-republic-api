import { MatchConstraint, InvoiceSourceType } from "@prisma/client";
import { eventTemplateCache, bookingCache } from "../../utils/cache-namespaces";
import EventTransactionSvc from "../event-transaction/event-transaction.service";
import EventRequestSvc from "../event-request/event-request.service";
import EventTemplateRepo from "../event-template/event-template.repository";
import EventRequestRepo from "../event-request/event-request.repository";
import NotificationSvc from "../notifications/user-notification.service";
import PaymentSvc from "../payment/payment.service";
import { prisma } from "../../utils/prisma";
import BookingRepo from "../booking/booking.repository";
import AppointmentAccess from "../appointment/appointment.access";

export default class MatchSvc {
  static async createMatchRequest(data: {
    clientId: string;
    foxerId: string;
    style: string;
    date: Date;
    endDate?: Date;
    guestCount: number;
    requestContent: string;
    totalAmount: number;
    venueId?: string;
  }) {
    // Read-only lookups that decide WHICH template to use — safe to do ahead
    // of the transaction below, since nothing else concurrently modifies
    // these specific rows within this flow.
    let venue: Awaited<ReturnType<typeof prisma.venue.findUnique>> = null;
    let existingTemplateId: string | null = null;

    if (data.venueId) {
      venue = await prisma.venue.findUnique({ where: { id: data.venueId } });
      if (!venue) throw new Error("Venue not found");
    } else {
      const { templates: foxerTemplates } =
        await EventTemplateRepo.findAllTemplates({ ownerId: data.foxerId });
      existingTemplateId =
        foxerTemplates.length > 0 ? foxerTemplates[0].id : null;
    }

    // Template creation/venue-attach, event-request creation, booking
    // creation, and supplier-transaction creation are now one atomic unit —
    // previously these were four separate top-level operations, so a
    // failure partway (e.g. an availability conflict on step 4) could leave
    // a real Booking row with no transactions behind it. `tx` is threaded
    // through every write below; each repo/service accepts it as an
    // optional parameter and uses the bare `prisma` client when called from
    // elsewhere that doesn't need this atomicity.
    const { eventRequest, booking } = await prisma.$transaction(async (tx) => {
      let templateId = existingTemplateId;

      if (data.venueId && venue) {
        const newTemplate = await tx.eventTemplate.create({
          data: {
            ownerId: data.foxerId,
            name: "Venue Match",
            description: `Venue-only match request for ${venue.name}`,
            category: "other",
            isPublic: false,
            targetCity: venue.city,
            targetState: venue.state ?? undefined,
            targetCountry: venue.country,
          },
        });
        templateId = newTemplate.id;

        await EventTemplateRepo.attachVenue(
          templateId,
          data.venueId,
          { matched: true, matchConstraint: MatchConstraint.SAME_STATE },
          `Matched venue ${venue.name} for request`,
          new Date(),
          venue.price.toNumber(),
          false,
          tx,
        );
      } else if (!templateId) {
        const newTemplate = await tx.eventTemplate.create({
          data: {
            ownerId: data.foxerId,
            name: "Custom Vibe Match",
            description: "A personalized experience request.",
            category: "other",
            isPublic: false,
          },
        });
        templateId = newTemplate.id;
      }

      // 2. Create the Event request from the template.
      const eventRequest = await EventRequestSvc.spawnRequestFromTemplate(
        {
          clientId: data.clientId,
          templateId,
          name: `Match with ${data.style}`,
          description: data.requestContent || `Custom match for ${data.style}`,
          startAt: data.date,
          endAt:
            data.endDate ?? new Date(data.date.getTime() + 4 * 60 * 60 * 1000),
          guestCount: data.guestCount,
          totalAmount: data.totalAmount,
        },
        tx,
      );

      // 3. Create a Booking in 'pending' status using server-computed event totals.
      const booking = await BookingRepo.createWithIds(
        {
          eventId: eventRequest.id,
          userId: data.clientId,
          guestCount: data.guestCount,
          totalAmount: eventRequest.totalAmount,
          hostMarkup: eventRequest.hostMarkupAmount,
          platformFee: eventRequest.platformFeeAmount,
          status: "pending",
          startAt: eventRequest.startAt,
          endAt: eventRequest.endAt,
        },
        tx,
      );

      // 4. Build event-level supplier transactions from any matched template
      // items — now availability-checked (AvailabilitySvc.reserve) inside
      // this same transaction, so an availability conflict here rolls back
      // the template/event/booking rows created above too, instead of
      // leaving an orphaned booking with no transactions.
      await EventTransactionSvc.createTransactionsFromTemplate(
        eventRequest.id,
        booking.id,
        tx,
      );

      return { eventRequest, booking };
    });

    // Cache invalidation only after commit — acting on state that might
    // still roll back would be wrong, same principle as the Stripe call in
    // the Phase B checkout design being placed after commit, not inside.
    await eventTemplateCache.invalidateAll();
    await bookingCache.invalidateAll();

    // 5. Let the foxer know a client is waiting on their match request —
    // also after commit; an external notification for a booking that didn't
    // actually get created would be worse than a slightly-delayed one.
    const client = await prisma.user.findUnique({
      where: { id: data.clientId },
      select: { name: true },
    });
    await NotificationSvc.create({
      userId: data.foxerId,
      type: "MATCH_REQUESTED",
      title: "New match request",
      message: `${client?.name ?? "A client"} booked you for "${data.style}" — review the details and respond.`,
      metadata: { link: "/user/passport" },
    });

    return { eventRequest, booking };
  }

  static async getFoxerClientInbox(foxerId: string, limit = 10, offset = 0) {
    const [events, total] = await Promise.all([
      prisma.event.findMany({
        // The Event Owner's requests, and those of Events they organise.
        where: AppointmentAccess.eventScope(foxerId, "event:approve-bookings"),
        select: {
          id: true,
          name: true,
          description: true,
          startAt: true,
          guestCount: true,
          totalAmount: true,
          requestStatus: true,
          eventStatus: true,
          createdAt: true,
          client: { select: { id: true, name: true, imgId: true } },
          template: { select: { id: true, name: true, category: true } },
          bookings: { select: { id: true, status: true }, take: 1 },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.event.count({
        where: AppointmentAccess.eventScope(foxerId, "event:approve-bookings"),
      }),
    ]);
    const data = events.map(({ bookings, ...event }) => ({
      ...event,
      bookingId: bookings[0]?.id ?? null,
      bookingStatus: bookings[0]?.status ?? null,
    }));
    return { data, total, hasMore: offset + limit < total };
  }

  static async acceptMatch(eventId: string, foxerId: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { bookings: { select: { id: true, stripePaymentId: true } } },
    });
    if (!event) throw new Error("Match not found");
    // The Event Owner or one of their Organizers (`event:approve-bookings`).
    // Declining refunds the client, so declineMatch stays the Owner's alone.
    if (
      !(await AppointmentAccess.canOnEvent(
        eventId,
        foxerId,
        "event:approve-bookings",
      ))
    ) {
      throw new Error("Unauthorized");
    }
    if (event.requestStatus !== "pending")
      throw new Error("Match already processed");

    await EventRequestRepo.updateRequestStatus(eventId, "approved");

    if (event.clientId) {
      await NotificationSvc.create({
        userId: event.clientId,
        type: "MATCH_ACCEPTED",
        title: "Match Accepted!",
        message: `Your match request "${event.name}" has been accepted.`,
        metadata: { link: "/user/passport" },
      });
    }
  }

  static async declineMatch(eventId: string, foxerId: string, reason?: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { bookings: { select: { id: true, stripePaymentId: true } } },
    });
    if (!event) throw new Error("Match not found");
    if (event.organizerId !== foxerId) throw new Error("Unauthorized");
    if (event.requestStatus !== "pending")
      throw new Error("Match already processed");

    await EventRequestRepo.rejectRequest(eventId, reason);

    for (const booking of event.bookings) {
      if (booking.stripePaymentId) {
        await PaymentSvc.refundPayment(booking.stripePaymentId);
      }
      await BookingRepo.cancel(booking.id);
    }

    if (event.clientId) {
      await NotificationSvc.create({
        userId: event.clientId,
        type: "MATCH_DECLINED",
        title: "Match Declined",
        message: `Your match request "${event.name}" was not accepted.`,
        metadata: { link: "/user/passport" },
      });
    }
  }

  static async getMyMatches(clientId: string) {
    const bookings = await prisma.booking.findMany({
      where: { userId: clientId },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            description: true,
            startAt: true,
            endAt: true,
            guestCount: true,
            totalAmount: true,
            requestStatus: true,
            eventStatus: true,
            host: { select: { id: true, name: true, imgId: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // `Booking` has no `payments` relation any more — payments are
    // invoice-scoped, reached through the `booking`-sourced InvoiceItem.
    // Batched rather than one query per booking.
    const bookingIds = bookings.map((b) => b.id);
    const items = await prisma.invoiceItem.findMany({
      where: {
        sourceType: InvoiceSourceType.booking,
        sourceId: { in: bookingIds },
      },
      select: {
        sourceId: true,
        invoice: {
          select: {
            payments: {
              select: {
                id: true,
                amount: true,
                status: true,
                method: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });
    const paymentsByBookingId = new Map(
      items.map((i) => [i.sourceId, i.invoice.payments]),
    );

    return bookings.map((b) => ({
      ...b,
      payments: paymentsByBookingId.get(b.id) ?? [],
    }));
  }
}
