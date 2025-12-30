import { prisma } from "../utils/prisma";
import { EventStatus } from "@prisma/client";

export default class EventRepo {
  // READ ALL with filters
  static async getAllEvents(filters?: {
    hostId?: string;
    categoryId?: string;
    status?: EventStatus;
    isPublished?: boolean;
  }) {
    return prisma.event.findMany({
      where: {
        ...(filters?.hostId && { hostId: filters.hostId }),
        ...(filters?.categoryId && { categoryId: filters.categoryId }),
        ...(filters?.status && { status: filters.status }),
        ...(filters?.isPublished !== undefined && {
          isPublished: filters.isPublished,
        }),
      },
      select: {
        id: true,
        hostId: true,
        categoryId: true,
        title: true,
        description: true,
        status: true,
        maxAttendees: true,
        isPublished: true,
        createdAt: true,
        updatedAt: true,
        host: {
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        images: {
          where: {
            isPrimary: true,
          },
          take: 1,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  // GET EVENTS BY CATEGORY SLUG
  static async getEventsByCategorySlug(slug: string) {
    return prisma.event.findMany({
      where: {
        category: {
          slug: slug,
        },
        isPublished: true,
      },
      select: {
        id: true,
        hostId: true,
        categoryId: true,
        title: true,
        description: true,
        status: true,
        maxAttendees: true,
        isPublished: true,
        createdAt: true,
        updatedAt: true,
        host: {
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
            profileImage: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        details: {
          select: {
            locationAddress: true,
            city: true,
            state: true,
            country: true,
          },
        },
        pricing: {
          select: {
            basePrice: true,
            currency: true,
          },
          take: 1,
        },
        images: {
          orderBy: {
            displayOrder: "asc",
          },
        },
        reviews: {
          select: {
            rating: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  // READ ONE by ID with full details
  static async getEventById(id: string) {
    return prisma.event.findUnique({
      where: { id },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
            profileImage: true,
          },
        },
        category: true,
        details: true,
        pricing: true,
        availability: true,
        images: {
          orderBy: {
            displayOrder: "asc",
          },
        },
        reviews: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                profileImage: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 10,
        },
      },
    });
  }

  // CREATE
  static async createEvent(data: {
    hostId: string;
    categoryId?: string;
    title: string;
    description: string;
    status: EventStatus;
    maxAttendees?: number;
    isPublished?: boolean;
  }) {
    return prisma.event.create({
      data: {
        hostId: data.hostId,
        categoryId: data.categoryId,
        title: data.title,
        description: data.description,
        status: data.status,
        maxAttendees: data.maxAttendees,
        isPublished: data.isPublished,
      },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
          },
        },
        category: true,
      },
    });
  }

  // UPDATE
  static async updateEvent(
    id: string,
    data: Partial<{
      categoryId: string;
      title: string;
      description: string;
      status: EventStatus;
      maxAttendees: number;
      isPublished: boolean;
    }>
  ) {
    return prisma.event.update({
      where: { id },
      data,
      include: {
        host: {
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
          },
        },
        category: true,
        details: true,
        pricing: true,
      },
    });
  }

  // DELETE
  static async deleteEvent(id: string) {
    return prisma.event.delete({
      where: { id },
    });
  }

  // CREATE EVENT DETAILS
  static async createEventDetails(data: {
    eventId: string;
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
  }) {
    return prisma.eventDetails.create({
      data: {
        eventId: data.eventId,
        locationAddress: data.locationAddress,
        city: data.city,
        state: data.state,
        country: data.country,
        latitude: data.latitude,
        longitude: data.longitude,
        startDatetime: data.startDatetime,
        endDatetime: data.endDatetime,
        durationMinutes: data.durationMinutes,
        requirements: data.requirements,
        cancellationPolicy: data.cancellationPolicy,
        itineraryJson: data.itineraryJson,
      },
    });
  }

  // UPDATE EVENT DETAILS
  static async updateEventDetails(
    eventId: string,
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
    return prisma.eventDetails.update({
      where: { eventId },
      data,
    });
  }

  // CREATE EVENT PRICING
  static async createEventPricing(data: {
    eventId: string;
    basePrice: number;
    currency: string;
    serviceFeePercent: number;
    taxPercent: number;
    pricingTiers?: any;
    earlyBirdDiscount?: any;
    earlyBirdDeadline?: Date;
  }) {
    return prisma.eventPricing.create({
      data: {
        eventId: data.eventId,
        basePrice: data.basePrice,
        currency: data.currency,
        serviceFeePercent: data.serviceFeePercent,
        taxPercent: data.taxPercent,
        pricingTiers: data.pricingTiers,
        earlyBirdDiscount: data.earlyBirdDiscount,
        earlyBirdDeadline: data.earlyBirdDeadline,
      },
    });
  }

  // ADD EVENT IMAGE
  static async addEventImage(data: {
    eventId: string;
    imageUrl: string;
    altText?: string;
    displayOrder?: number;
    isPrimary?: boolean;
  }) {
    return prisma.eventImage.create({
      data: {
        eventId: data.eventId,
        imageUrl: data.imageUrl,
        altText: data.altText,
        displayOrder: data.displayOrder,
        isPrimary: data.isPrimary,
      },
    });
  }

  // Check if event exists
  static async eventExists(id: string) {
    const event = await prisma.event.findUnique({
      where: { id },
      select: { id: true },
    });
    return !!event;
  }

  // Check if user is host of event
  static async isEventHost(eventId: string, userId: string) {
    const event = await prisma.event.findFirst({
      where: {
        id: eventId,
        hostId: userId,
      },
      select: { id: true },
    });
    return !!event;
  }
}
