import { PrismaClient, Venue, VenueStatus, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

export default class VenueRepository {
  // Create a new venue with all details
  static async createVenue(data: {
    hostId: string;
    categoryId?: string;
    name: string;
    description: string;
    venueType: string;
    capacity?: number;
    status?: VenueStatus;
    isPublished?: boolean;
    address: string;
    city: string;
    state: string;
    country: string;
    latitude?: number;
    longitude?: number;
    pricing?: {
      pricePerDay: number;
      pricePerHour?: number;
      currency?: string;
      minHours?: number;
    };
    amenities?: Array<{ name: string; icon?: string }>;
    images?: Array<{
      imageUrl: string;
      altText?: string;
      displayOrder?: number;
      isPrimary?: boolean;
    }>;
  }): Promise<Venue> {
    const { pricing, amenities, images, ...venueData } = data;

    return await prisma.venue.create({
      data: {
        ...venueData,
        latitude: data.latitude ? new Prisma.Decimal(data.latitude) : undefined,
        longitude: data.longitude ? new Prisma.Decimal(data.longitude) : undefined,
        pricing: pricing
          ? {
              create: {
                pricePerDay: new Prisma.Decimal(pricing.pricePerDay),
                pricePerHour: pricing.pricePerHour
                  ? new Prisma.Decimal(pricing.pricePerHour)
                  : undefined,
                currency: pricing.currency || "PHP",
                minHours: pricing.minHours,
              },
            }
          : undefined,
        amenities: amenities
          ? {
              create: amenities,
            }
          : undefined,
        images: images
          ? {
              create: images,
            }
          : undefined,
      },
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
        pricing: true,
        amenities: true,
        images: true,
      },
    });
  }

  // Get all venues with filters
  static async getAllVenues(filters?: {
    hostId?: string;
    categoryId?: string;
    city?: string;
    status?: VenueStatus;
    isPublished?: boolean;
  }) {
    return await prisma.venue.findMany({
      where: {
        hostId: filters?.hostId,
        categoryId: filters?.categoryId,
        city: filters?.city,
        status: filters?.status,
        isPublished: filters?.isPublished,
      },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            username: true,
            profileImage: true,
          },
        },
        category: true,
        pricing: true,
        amenities: true,
        images: true,
        _count: {
          select: {
            reviews: true,
            events: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  // Get venue by ID
  static async getVenueById(id: string) {
    return await prisma.venue.findUnique({
      where: { id },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
            phone: true,
            profileImage: true,
          },
        },
        category: true,
        pricing: true,
        amenities: true,
        images: {
          orderBy: {
            displayOrder: "asc",
          },
        },
        reviews: {
          take: 10,
          orderBy: {
            createdAt: "desc",
          },
        },
        _count: {
          select: {
            reviews: true,
            events: true,
          },
        },
      },
    });
  }

  // Get venues by category slug
  static async getVenuesByCategory(categorySlug: string) {
    return await prisma.venue.findMany({
      where: {
        category: {
          slug: categorySlug,
        },
        isPublished: true,
        status: "active",
      },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            username: true,
            profileImage: true,
          },
        },
        category: true,
        pricing: true,
        images: {
          where: {
            isPrimary: true,
          },
          take: 1,
        },
        _count: {
          select: {
            reviews: true,
          },
        },
      },
    });
  }

  // Update venue
  static async updateVenue(
    id: string,
    hostId: string,
    data: Partial<{
      categoryId: string;
      name: string;
      description: string;
      venueType: string;
      capacity: number;
      status: VenueStatus;
      isPublished: boolean;
      address: string;
      city: string;
      state: string;
      country: string;
      latitude: number;
      longitude: number;
    }>
  ) {
    // Verify ownership
    const venue = await prisma.venue.findUnique({
      where: { id },
      select: { hostId: true },
    });

    if (!venue) {
      throw new Error("Venue not found");
    }

    if (venue.hostId !== hostId) {
      throw new Error("Unauthorized: You can only update your own venues");
    }

    return await prisma.venue.update({
      where: { id },
      data: {
        ...data,
        latitude: data.latitude ? new Prisma.Decimal(data.latitude) : undefined,
        longitude: data.longitude ? new Prisma.Decimal(data.longitude) : undefined,
      },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            username: true,
            profileImage: true,
          },
        },
        category: true,
        pricing: true,
        amenities: true,
        images: true,
      },
    });
  }

  // Delete venue
  static async deleteVenue(id: string, hostId: string) {
    // Verify ownership
    const venue = await prisma.venue.findUnique({
      where: { id },
      select: { hostId: true },
    });

    if (!venue) {
      throw new Error("Venue not found");
    }

    if (venue.hostId !== hostId) {
      throw new Error("Unauthorized: You can only delete your own venues");
    }

    await prisma.venue.delete({
      where: { id },
    });
  }

  // Add amenity to venue
  static async addAmenity(
    venueId: string,
    hostId: string,
    amenityData: { name: string; icon?: string }
  ) {
    // Verify ownership
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { hostId: true },
    });

    if (!venue) {
      throw new Error("Venue not found");
    }

    if (venue.hostId !== hostId) {
      throw new Error("Unauthorized");
    }

    return await prisma.venueAmenity.create({
      data: {
        venueId,
        ...amenityData,
      },
    });
  }

  // Remove amenity
  static async removeAmenity(amenityId: string, hostId: string) {
    const amenity = await prisma.venueAmenity.findUnique({
      where: { id: amenityId },
      include: {
        venue: {
          select: { hostId: true },
        },
      },
    });

    if (!amenity) {
      throw new Error("Amenity not found");
    }

    if (amenity.venue.hostId !== hostId) {
      throw new Error("Unauthorized");
    }

    await prisma.venueAmenity.delete({
      where: { id: amenityId },
    });
  }

  // Add image to venue
  static async addImage(
    venueId: string,
    hostId: string,
    imageData: {
      imageUrl: string;
      altText?: string;
      displayOrder?: number;
      isPrimary?: boolean;
    }
  ) {
    // Verify ownership
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { hostId: true },
    });

    if (!venue) {
      throw new Error("Venue not found");
    }

    if (venue.hostId !== hostId) {
      throw new Error("Unauthorized");
    }

    // If setting as primary, unset other primary images
    if (imageData.isPrimary) {
      await prisma.venueImage.updateMany({
        where: { venueId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    return await prisma.venueImage.create({
      data: {
        venueId,
        ...imageData,
      },
    });
  }

  // Remove image
  static async removeImage(imageId: string, hostId: string) {
    const image = await prisma.venueImage.findUnique({
      where: { id: imageId },
      include: {
        venue: {
          select: { hostId: true },
        },
      },
    });

    if (!image) {
      throw new Error("Image not found");
    }

    if (image.venue.hostId !== hostId) {
      throw new Error("Unauthorized");
    }

    await prisma.venueImage.delete({
      where: { id: imageId },
    });
  }

  // Add review
  static async addReview(
    venueId: string,
    userId: string,
    reviewData: { rating: number; comment?: string }
  ) {
    return await prisma.venueReview.create({
      data: {
        venueId,
        userId,
        ...reviewData,
      },
    });
  }

  // Get venue reviews
  static async getVenueReviews(venueId: string) {
    return await prisma.venueReview.findMany({
      where: { venueId },
      orderBy: {
        createdAt: "desc",
      },
    });
  }
}
