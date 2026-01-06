import EventRepo from "../repositories/event.repository";
import { EventStatus } from "@prisma/client";

export default class EventSvc {
  // GET ALL EVENTS
  static async getAllEvents(filters?: {
    hostId?: string;
    categoryId?: string;
    status?: EventStatus;
    isPublished?: boolean;
  }) {
    return EventRepo.getAllEvents(filters);
  }

  // GET EVENTS BY CATEGORY SLUG
  static async getEventsByCategorySlug(slug: string) {
    return EventRepo.getEventsByCategorySlug(slug);
  }

  // GET EVENT BY ID
  static async getEventById(id: string) {
    const event = await EventRepo.getEventById(id);
    if (!event) {
      throw new Error("Event not found");
    }
    return event;
  }

  // CREATE EVENT (Basic event creation)
  static async createEvent(data: {
    hostId: string;
    categoryId?: string;
    title: string;
    description: string;
    status?: EventStatus;
    maxAttendees?: number;
    isPublished?: boolean;
  }) {
    // Validate required fields
    if (!data.title || !data.description) {
      throw new Error("Title and description are required");
    }

    return EventRepo.createEvent({
      foxerId: data.hostId,
      categoryId: data.categoryId,
      title: data.title,
      description: data.description,
      status: data.status || EventStatus.draft,
      maxAttendees: data.maxAttendees,
      isPublished: data.isPublished || false,
    });
  }

  // CREATE COMPLETE EVENT (with details and pricing)
  static async createCompleteEvent(data: {
    hostId: string;
    categoryId?: string;
    title: string;
    description: string;
    status?: EventStatus;
    maxAttendees?: number;
    isPublished?: boolean;
    details?: {
      locationAddress: string;
      city: string;
      state: string;
      country: string;
      latitude?: number;
      longitude?: number;
      startDatetime: Date;
      endDatetime: Date;
      durationMinutes?: number;
      requirements?: string;
      cancellationPolicy?: string;
      itineraryJson?: string;
    };
    pricing?: {
      basePrice: number;
      currency: string;
      serviceFeePercent?: number;
      taxPercent?: number;
      pricingTiers?: any;
      earlyBirdDiscount?: any;
      earlyBirdDeadline?: Date;
    };
    images?: Array<{
      imageUrl: string;
      altText?: string;
      displayOrder?: number;
      isPrimary?: boolean;
    }>;
  }) {
    // Create the event first
    const event = await this.createEvent({
      hostId: data.hostId,
      categoryId: data.categoryId,
      title: data.title,
      description: data.description,
      status: data.status,
      maxAttendees: data.maxAttendees,
      isPublished: data.isPublished,
    });

    // Add details if provided
    if (data.details) {
      await EventRepo.createEventDetails({
        eventId: event.id,
        ...data.details,
      });
    }

    // Add pricing if provided
    if (data.pricing) {
      await EventRepo.createEventPricing({
        eventId: event.id,
        basePrice: data.pricing.basePrice,
        currency: data.pricing.currency || "USD",
        serviceFeePercent: data.pricing.serviceFeePercent || 0,
        taxPercent: data.pricing.taxPercent || 0,
        pricingTiers: data.pricing.pricingTiers,
        earlyBirdDiscount: data.pricing.earlyBirdDiscount,
        earlyBirdDeadline: data.pricing.earlyBirdDeadline,
      });
    }

    // Add images if provided
    if (data.images && data.images.length > 0) {
      for (const image of data.images) {
        await EventRepo.addEventImage({
          eventId: event.id,
          imageUrl: image.imageUrl,
          altText: image.altText,
          displayOrder: image.displayOrder,
          isPrimary: image.isPrimary,
        });
      }
    }

    // Return the complete event
    return EventRepo.getEventById(event.id);
  }

  // UPDATE EVENT
  static async updateEvent(
    id: string,
    userId: string,
    data: Partial<{
      categoryId: string;
      title: string;
      description: string;
      status: EventStatus;
      maxAttendees: number;
      isPublished: boolean;
    }>
  ) {
    // Check if event exists
    const exists = await EventRepo.eventExists(id);
    if (!exists) {
      throw new Error("Event not found");
    }

    // Check if user is the host (authorization)
    const isHost = await EventRepo.isEventFoxer(id, userId);
    if (!isHost) {
      throw new Error("Unauthorized: You can only update your own events");
    }

    return EventRepo.updateEvent(id, data);
  }

  // UPDATE EVENT DETAILS
  static async updateEventDetails(
    eventId: string,
    userId: string,
    data: Partial<{
      locationAddress: string;
      city: string;
      state: string;
      country: string;
      latitude: number;
      longitude: number;
      startDatetime: Date;
      endDatetime: Date;
      durationMinutes: number;
      requirements: string;
      cancellationPolicy: string;
      itineraryJson: string;
    }>
  ) {
    // Check if user is the host
    const isHost = await EventRepo.isEventFoxer(eventId, userId);
    if (!isHost) {
      throw new Error("Unauthorized: You can only update your own events");
    }

    return EventRepo.updateEventDetails(eventId, data);
  }

  // DELETE EVENT
  static async deleteEvent(id: string, userId: string) {
    // Check if event exists
    const exists = await EventRepo.eventExists(id);
    if (!exists) {
      throw new Error("Event not found");
    }

    // Check if user is the host (authorization)
    const isHost = await EventRepo.isEventFoxer(id, userId);
    if (!isHost) {
      throw new Error("Unauthorized: You can only delete your own events");
    }

    return EventRepo.deleteEvent(id);
  }

  // ADD EVENT IMAGE
  static async addEventImage(
    eventId: string,
    userId: string,
    data: {
      imageUrl: string;
      altText?: string;
      displayOrder?: number;
      isPrimary?: boolean;
    }
  ) {
    // Check if user is the host
    const isHost = await EventRepo.isEventFoxer(eventId, userId);
    if (!isHost) {
      throw new Error(
        "Unauthorized: You can only add images to your own events"
      );
    }

    return EventRepo.addEventImage({
      eventId,
      ...data,
    });
  }
}
