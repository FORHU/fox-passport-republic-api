import { Request, Response } from "express";
import LocationsSvc from "../services/locations.service";

export default class LocationsCtrl {
  static async searchLocations(req: Request, res: Response) {
    try {
      const q = (req.query.q as string) || "";
      if (!q || q.trim().length < 2) {
        return res
          .status(200)
          .json({ status: "success", data: { locations: [] } });
      }
      const limit = Math.min(Number(req.query.limit) || 8, 20);
      const locations = await LocationsSvc.searchCities(q, limit);
      return res.status(200).json({ status: "success", data: { locations } });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(500).json({ status: "error", message: err.message });
    }
  }
}
