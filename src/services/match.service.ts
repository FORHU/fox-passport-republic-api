import EventRequestRepo from "../repositories/event-request.repository";
import BookingRepo from "../repositories/booking.repository";
import EventTemplateRepo from "../repositories/event-template.repository";
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
  }) {
    // 1. We might need an EventTemplate to create an EventClientRequest
    // For now, let's find or create a generic "Vibe Match" template for the Foxer
    // Or just create the request directly if the schema allows it (it requires a templateId)
    
    // Let's assume we use a default template or just fetch the first one for the foxer
    let templates = await prisma.eventTemplate.findMany({
        where: { ownerId: data.foxerId }
    });

    let templateId = templates.length > 0 ? templates[0].id : null;

    if (!templateId) {
        // Create a basic template if none exists
        const newTemplate = await prisma.eventTemplate.create({
            data: {
                ownerId: data.foxerId,
                name: "Custom Vibe Match",
                description: "A personalized experience request.",
                category: "other",
                isPublic: false
            }
        });
        templateId = newTemplate.id;
    }

    // 2. Create the Event (match request)
    const eventRequest = await prisma.event.create({
      data: {
        clientId: data.clientId,
        organizerId: data.foxerId,
        templateId: templateId,
        name: `Match with ${data.style}`,
        description: data.requestContent || `Custom match for ${data.style}`,
        eventCategory: 'other',
        startAt: data.date,
        endAt: new Date(data.date.getTime() + 4 * 60 * 60 * 1000),
        guestCount: data.guestCount,
        totalAmount: data.totalAmount,
      }
    });

    // 3. Create a Booking in 'pending' status
    const booking = await prisma.booking.create({
        data: {
            eventId: eventRequest.id,
            userId: data.clientId,
            guestCount: data.guestCount,
            totalAmount: data.totalAmount,
            status: 'pending',
            startAt: eventRequest.startAt,
            endAt: eventRequest.endAt
        }
    });

    return { eventRequest, booking };
  }
}
