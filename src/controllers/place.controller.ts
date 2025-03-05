import { Request, Response } from "express";
import { getAddressAutocomplete } from "../utils/google/utils";

export default class PlaceController {
  static async getCompleteAddress(req: Request, res: Response) {
    const input = req.query.input as string;
    const country = req.query.country as string;

    try {
      const suggestions = await getAddressAutocomplete(input, country);
      return res.json({ predictions: suggestions });
    } catch (error: any) {
      console.error("Error fetching Google Maps API:", error.message);
      return res.status(500).json({ error: error.message });
    }
  }
}
