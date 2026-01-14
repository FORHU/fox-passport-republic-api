import { Request, Response } from "express";
import VenueSvc from "../services/venue.service";
import Joi from "joi";

export default class VenueCtrl {
    static async getAllVenues(req: Request, res: Response) {
        try {
            const venues = await VenueSvc.getAllVenues(req.query);
            return res.status(200).json({ success: true, data: venues });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    static async getVenueById(req: Request, res: Response) {
        try {
            const venue = await VenueSvc.getVenueById(req.params.id);
            return res.status(200).json({ success: true, data: venue });
        } catch (error: any) {
            return res.status(404).json({ success: false, message: error.message });
        }
    }

    static async createVenue(req: Request, res: Response) {
        try {
            // Schema validation could go here
            const venue = await VenueSvc.createVenue({
                mayorId: req.user!.id,
                ...req.body
            });
            return res.status(201).json({ success: true, data: venue });
        } catch (error: any) {
            return res.status(400).json({ success: false, message: error.message });
        }
    }

    static async updateVenue(req: Request, res: Response) {
        try {
            const venue = await VenueSvc.updateVenue(req.params.id, req.user!.id, req.body);
            return res.status(200).json({ success: true, data: venue });
        } catch (error: any) {
            return res.status(400).json({ success: false, message: error.message });
        }
    }

    static async deleteVenue(req: Request, res: Response) {
        try {
            await VenueSvc.deleteVenue(req.params.id, req.user!.id);
            return res.status(200).json({ success: true, message: "Venue deleted" });
        } catch (error: any) {
            return res.status(400).json({ success: false, message: error.message });
        }
    }
}
