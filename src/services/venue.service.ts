import VenueRepository from "../repositories/venue.repository";
import { VenueStatus } from "@prisma/client";

export default class VenueService {
  // Create a new venue
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
  }) {
    // Validate required fields
    if (!data.name || !data.description || !data.address || !data.city || !data.state) {
      throw new Error("Missing required fields");
    }

    // Validate venue type
    const validVenueTypes = [
      "hotel",
      "land",
      "hall",
      "outdoor_space",
      "restaurant",
      "conference_room",
      "beach",
      "garden",
      "rooftop",
      "warehouse",
      "other",
    ];

    if (!validVenueTypes.includes(data.venueType.toLowerCase())) {
      throw new Error(
        `Invalid venue type. Must be one of: ${validVenueTypes.join(", ")}`
      );
    }

    // Validate capacity if provided
    if (data.capacity !== undefined && data.capacity < 1) {
      throw new Error("Capacity must be at least 1");
    }

    // Validate coordinates if provided
    if (data.latitude !== undefined) {
      if (data.latitude < -90 || data.latitude > 90) {
        throw new Error("Latitude must be between -90 and 90");
      }
    }

    if (data.longitude !== undefined) {
      if (data.longitude < -180 || data.longitude > 180) {
        throw new Error("Longitude must be between -180 and 180");
      }
    }

    // Validate pricing if provided
    if (data.pricing) {
      if (data.pricing.pricePerDay <= 0) {
        throw new Error("Price per day must be greater than 0");
      }

      if (data.pricing.pricePerHour !== undefined && data.pricing.pricePerHour <= 0) {
        throw new Error("Price per hour must be greater than 0");
      }

      if (data.pricing.minHours !== undefined && data.pricing.minHours < 1) {
        throw new Error("Minimum hours must be at least 1");
      }
    }

    // Create venue
    return await VenueRepository.createVenue(data);
  }

  // Get all venues with filters
  static async getAllVenues(filters?: {
    hostId?: string;
    categoryId?: string;
    city?: string;
    status?: VenueStatus;
    isPublished?: boolean;
  }) {
    return await VenueRepository.getAllVenues(filters);
  }

  // Get venue by ID
  static async getVenueById(id: string) {
    if (!id) {
      throw new Error("Venue ID is required");
    }

    const venue = await VenueRepository.getVenueById(id);

    if (!venue) {
      throw new Error("Venue not found");
    }

    return venue;
  }

  // Get venues by category slug
  static async getVenuesByCategory(categorySlug: string) {
    if (!categorySlug) {
      throw new Error("Category slug is required");
    }

    return await VenueRepository.getVenuesByCategory(categorySlug);
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
    if (!id || !hostId) {
      throw new Error("Venue ID and Host ID are required");
    }

    // Validate data if provided
    if (data.capacity !== undefined && data.capacity < 1) {
      throw new Error("Capacity must be at least 1");
    }

    if (data.latitude !== undefined) {
      if (data.latitude < -90 || data.latitude > 90) {
        throw new Error("Latitude must be between -90 and 90");
      }
    }

    if (data.longitude !== undefined) {
      if (data.longitude < -180 || data.longitude > 180) {
        throw new Error("Longitude must be between -180 and 180");
      }
    }

    return await VenueRepository.updateVenue(id, hostId, data);
  }

  // Delete venue
  static async deleteVenue(id: string, hostId: string) {
    if (!id || !hostId) {
      throw new Error("Venue ID and Host ID are required");
    }

    await VenueRepository.deleteVenue(id, hostId);
    return { message: "Venue deleted successfully" };
  }

  // Add amenity to venue
  static async addAmenity(
    venueId: string,
    hostId: string,
    amenityData: { name: string; icon?: string }
  ) {
    if (!venueId || !hostId) {
      throw new Error("Venue ID and Host ID are required");
    }

    if (!amenityData.name) {
      throw new Error("Amenity name is required");
    }

    return await VenueRepository.addAmenity(venueId, hostId, amenityData);
  }

  // Remove amenity
  static async removeAmenity(amenityId: string, hostId: string) {
    if (!amenityId || !hostId) {
      throw new Error("Amenity ID and Host ID are required");
    }

    await VenueRepository.removeAmenity(amenityId, hostId);
    return { message: "Amenity removed successfully" };
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
    if (!venueId || !hostId) {
      throw new Error("Venue ID and Host ID are required");
    }

    if (!imageData.imageUrl) {
      throw new Error("Image URL is required");
    }

    // Validate URL format
    try {
      new URL(imageData.imageUrl);
    } catch (error) {
      throw new Error("Invalid image URL format");
    }

    return await VenueRepository.addImage(venueId, hostId, imageData);
  }

  // Remove image
  static async removeImage(imageId: string, hostId: string) {
    if (!imageId || !hostId) {
      throw new Error("Image ID and Host ID are required");
    }

    await VenueRepository.removeImage(imageId, hostId);
    return { message: "Image removed successfully" };
  }

  // Add review
  static async addReview(
    venueId: string,
    userId: string,
    reviewData: { rating: number; comment?: string }
  ) {
    if (!venueId || !userId) {
      throw new Error("Venue ID and User ID are required");
    }

    if (!reviewData.rating) {
      throw new Error("Rating is required");
    }

    if (reviewData.rating < 1 || reviewData.rating > 5) {
      throw new Error("Rating must be between 1 and 5");
    }

    return await VenueRepository.addReview(venueId, userId, reviewData);
  }

  // Get venue reviews
  static async getVenueReviews(venueId: string) {
    if (!venueId) {
      throw new Error("Venue ID is required");
    }

    return await VenueRepository.getVenueReviews(venueId);
  }
}
