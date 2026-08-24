import { MatchConstraint } from "@prisma/client";
import EventTransactionSvc from "./event-transaction.service";
import EventRequestSvc from "./event-request.service";
import EventTemplateRepo from "../repositories/event-template.repository";
import EventRequestRepo from "../repositories/event-request.repository";
import NotificationSvc from "../modules/notifications/user-notification.service";
import PaymentSvc from "./payment.service";
import { prisma } from "../utils/prisma";

export default class MatchSvc {
  static async createMatchRequest(data: {
    clientId: string;
    foxerId: string;
    style: string;
    date: Date;
    guestCount: number;
    requestContent: string;
    totalAmount: number;
    venueId?: string;
  }) {
    let templateId: string | null = null;

    if (data.venueId) {
      const venue = await prisma.venue.findUnique({
        where: { id: data.venueId },
      });
      if (!venue) throw new Error("Venue not found");

      const newTemplate = await prisma.eventTemplate.create({
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
      );
    } else {
      const { templates: foxerTemplates } =
        await EventTemplateRepo.findAllTemplates({
          ownerId: data.foxerId,
        });
      templateId = foxerTemplates.length > 0 ? foxerTemplates[0].id : null;

      if (!templateId) {
        const newTemplate = await prisma.eventTemplate.create({
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
    }

    // 2. Create the Event request from the template.
    const eventRequest = await EventRequestSvc.spawnRequestFromTemplate({
      clientId: data.clientId,
      templateId,
      name: `Match with ${data.style}`,
      description: data.requestContent || `Custom match for ${data.style}`,
      startAt: data.date,
      endAt: new Date(data.date.getTime() + 4 * 60 * 60 * 1000),
      guestCount: data.guestCount,
      totalAmount: data.totalAmount,
    });

    // 3. Create a Booking in 'pending' status using server-computed event totals.
    const booking = await prisma.booking.create({
      data: {
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
    });

    // 4. Build event-level supplier transactions from any matched template items.
    await EventTransactionSvc.createTransactionsFromTemplate(
      eventRequest.id,
      booking.id,
    );

    return { eventRequest, booking };
  }

  static async getFoxerClientInbox(foxerId: string, limit = 10, offset = 0) {
    const [data, total] = await Promise.all([
      prisma.event.findMany({
        where: { organizerId: foxerId },
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
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.event.count({ where: { organizerId: foxerId } }),
    ]);
    return { data, total, hasMore: offset + limit < total };
  }

  static async acceptMatch(eventId: string, foxerId: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { bookings: { select: { id: true, stripePaymentId: true } } },
    });
    if (!event) throw new Error("Match not found");
    if (event.organizerId !== foxerId) throw new Error("Unauthorized");
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
      await prisma.booking.update({
        where: { id: booking.id },
        data: { status: "cancelled" },
      });
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
    return prisma.booking.findMany({
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
      orderBy: { createdAt: "desc" },
    });
  }
}
