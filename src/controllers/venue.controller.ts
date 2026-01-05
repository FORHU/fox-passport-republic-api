import { Request, Response } from "express";
import VenueService from "../services/venue.service";
import { VenueStatus } from "@prisma/client";

export default class VenueController {
  // Create a new venue
  static async createVenue(req: Request, res: Response) {
    try {
      const hostId = req.body.userId || (req as any).user?.id; // Get from auth middleware

      if (!hostId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: Host ID is required",
        });
      }

      const venue = await VenueService.createVenue({
        hostId,
        ...req.body,
      });

      return res.status(201).json({
        success: true,
        message: "Venue created successfully",
        data: venue,
      });
    } catch (error: any) {
      console.error("Error creating venue:", error);
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to create venue",
      });
    }
  }

  // Get all venues with filters
  static async getAllVenues(req: Request, res: Response) {
    try {
      const filters: {
        hostId?: string;
        categoryId?: string;
        city?: string;
        status?: VenueStatus;
        isPublished?: boolean;
      } = {};

      // Extract query parameters
      if (req.query.hostId) filters.hostId = req.query.hostId as string;
      if (req.query.categoryId) filters.categoryId = req.query.categoryId as string;
      if (req.query.city) filters.city = req.query.city as string;
      if (req.query.status) filters.status = req.query.status as VenueStatus;
      if (req.query.isPublished !== undefined) {
        filters.isPublished = req.query.isPublished === "true";
      }

      const venues = await VenueService.getAllVenues(filters);

      return res.status(200).json({
        success: true,
        data: venues,
        count: venues.length,
      });
    } catch (error: any) {
      console.error("Error fetching venues:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch venues",
      });
    }
  }

  // Get venue by ID
  static async getVenueById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const venue = await VenueService.getVenueById(id);

      return res.status(200).json({
        success: true,
        data: venue,
      });
    } catch (error: any) {
      console.error("Error fetching venue:", error);
      const statusCode = error.message === "Venue not found" ? 404 : 500;
      return res.status(statusCode).json({
        success: false,
        message: error.message || "Failed to fetch venue",
      });
    }
  }

  // Get venues by category slug
  static async getVenuesByCategory(req: Request, res: Response) {
    try {
      const { categorySlug } = req.params;

      const venues = await VenueService.getVenuesByCategory(categorySlug);

      return res.status(200).json({
        success: true,
        data: venues,
        count: venues.length,
      });
    } catch (error: any) {
      console.error("Error fetching venues by category:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch venues by category",
      });
    }
  }

  // Update venue
  static async updateVenue(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const hostId = req.body.userId || (req as any).user?.id; // Get from auth middleware

      if (!hostId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: Host ID is required",
        });
      }

      const venue = await VenueService.updateVenue(id, hostId, req.body);

      return res.status(200).json({
        success: true,
        message: "Venue updated successfully",
        data: venue,
      });
    } catch (error: any) {
      console.error("Error updating venue:", error);
      const statusCode =
        error.message === "Venue not found"
          ? 404
          : error.message.includes("Unauthorized")
          ? 403
          : 400;

      return res.status(statusCode).json({
        success: false,
        message: error.message || "Failed to update venue",
      });
    }
  }

  // Delete venue
  static async deleteVenue(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const hostId = req.body.userId || (req as any).user?.id; // Get from auth middleware

      if (!hostId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: Host ID is required",
        });
      }

      await VenueService.deleteVenue(id, hostId);

      return res.status(200).json({
        success: true,
        message: "Venue deleted successfully",
      });
    } catch (error: any) {
      console.error("Error deleting venue:", error);
      const statusCode =
        error.message === "Venue not found"
          ? 404
          : error.message.includes("Unauthorized")
          ? 403
          : 400;

      return res.status(statusCode).json({
        success: false,
        message: error.message || "Failed to delete venue",
      });
    }
  }

  // Add amenity to venue
  static async addAmenity(req: Request, res: Response) {
    try {
      const { venueId } = req.params;
      const hostId = req.body.userId || (req as any).user?.id; // Get from auth middleware

      if (!hostId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: Host ID is required",
        });
      }

      const amenity = await VenueService.addAmenity(venueId, hostId, req.body);

      return res.status(201).json({
        success: true,
        message: "Amenity added successfully",
        data: amenity,
      });
    } catch (error: any) {
      console.error("Error adding amenity:", error);
      const statusCode = error.message.includes("Unauthorized") ? 403 : 400;

      return res.status(statusCode).json({
        success: false,
        message: error.message || "Failed to add amenity",
      });
    }
  }

  // Remove amenity
  static async removeAmenity(req: Request, res: Response) {
    try {
      const { amenityId } = req.params;
      const hostId = req.body.userId || (req as any).user?.id; // Get from auth middleware

      if (!hostId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: Host ID is required",
        });
      }

      await VenueService.removeAmenity(amenityId, hostId);

      return res.status(200).json({
        success: true,
        message: "Amenity removed successfully",
      });
    } catch (error: any) {
      console.error("Error removing amenity:", error);
      const statusCode =
        error.message === "Amenity not found"
          ? 404
          : error.message.includes("Unauthorized")
          ? 403
          : 400;

      return res.status(statusCode).json({
        success: false,
        message: error.message || "Failed to remove amenity",
      });
    }
  }

  // Add image to venue
  static async addImage(req: Request, res: Response) {
    try {
      const { venueId } = req.params;
      const hostId = req.body.userId || (req as any).user?.id; // Get from auth middleware

      if (!hostId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: Host ID is required",
        });
      }

      const image = await VenueService.addImage(venueId, hostId, req.body);

      return res.status(201).json({
        success: true,
        message: "Image added successfully",
        data: image,
      });
    } catch (error: any) {
      console.error("Error adding image:", error);
      const statusCode = error.message.includes("Unauthorized") ? 403 : 400;

      return res.status(statusCode).json({
        success: false,
        message: error.message || "Failed to add image",
      });
    }
  }

  // Remove image
  static async removeImage(req: Request, res: Response) {
    try {
      const { imageId } = req.params;
      const hostId = req.body.userId || (req as any).user?.id; // Get from auth middleware

      if (!hostId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: Host ID is required",
        });
      }

      await VenueService.removeImage(imageId, hostId);

      return res.status(200).json({
        success: true,
        message: "Image removed successfully",
      });
    } catch (error: any) {
      console.error("Error removing image:", error);
      const statusCode =
        error.message === "Image not found"
          ? 404
          : error.message.includes("Unauthorized")
          ? 403
          : 400;

      return res.status(statusCode).json({
        success: false,
        message: error.message || "Failed to remove image",
      });
    }
  }

  // Add review
  static async addReview(req: Request, res: Response) {
    try {
      const { venueId } = req.params;
      const userId = req.body.userId || (req as any).user?.id; // Get from auth middleware

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: User ID is required",
        });
      }

      const review = await VenueService.addReview(venueId, userId, req.body);

      return res.status(201).json({
        success: true,
        message: "Review added successfully",
        data: review,
      });
    } catch (error: any) {
      console.error("Error adding review:", error);
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to add review",
      });
    }
  }

  // Get venue reviews
  static async getVenueReviews(req: Request, res: Response) {
    try {
      const { venueId } = req.params;

      const reviews = await VenueService.getVenueReviews(venueId);

      return res.status(200).json({
        success: true,
        data: reviews,
        count: reviews.length,
      });
    } catch (error: any) {
      console.error("Error fetching reviews:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch reviews",
      });
    }
  }
}
