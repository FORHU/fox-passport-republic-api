import { Request, Response } from "express";
import ListingRepo from "../repositories/listing.repository";
import { ListingStatus, ListingType } from "@prisma/client";

export default class SpecializedListingController {
    // GET ALL VENUES
    static async getVenues(req: Request, res: Response) {
        try {
            const listings = await ListingRepo.getAllListings({
                type: ListingType.venue,
                status: ListingStatus.published
            });
            return res.status(200).json({
                success: true,
                count: listings.length,
                data: listings,
            });
        } catch (error: any) {
            console.error("Get venues error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch venues",
            });
        }
    }

    // GET ALL CHAIRS/EQUIPMENT
    static async getEquipment(req: Request, res: Response) {
        try {
            const listings = await ListingRepo.getAllListings({
                type: ListingType.equipment,
                status: ListingStatus.published
            });
            return res.status(200).json({
                success: true,
                count: listings.length,
                data: listings,
            });
        } catch (error: any) {
            console.error("Get equipment error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch equipment",
            });
        }
    }

    // GET ALL FOODS/CATERING
    static async getCatering(req: Request, res: Response) {
        try {
            const listings = await ListingRepo.getAllListings({
                type: ListingType.catering,
                status: ListingStatus.published
            });
            return res.status(200).json({
                success: true,
                count: listings.length,
                data: listings,
            });
        } catch (error: any) {
            console.error("Get catering error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch catering",
            });
        }
    }

    // GET ALL EVENTS
    static async getEvents(req: Request, res: Response) {
        try {
            const listings = await ListingRepo.getAllListings({
                type: ListingType.event,
                status: ListingStatus.published
            });
            return res.status(200).json({
                success: true,
                count: listings.length,
                data: listings,
            });
        } catch (error: any) {
            console.error("Get events error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch events",
            });
        }
    }
}
