import { Request, Response } from "express";
import { GOOGLE_MAPS_API_KEY } from "../config";

export default class PlaceController {
  static async getCompleteAddress(req: Request, res: Response) {
    const input = req.query.input as string;
    const country = (req.query.country as string) || "sg";

    if (!input) {
      return res.status(400).json({ error: "Input field is required" });
    }

    if (!GOOGLE_MAPS_API_KEY) {
      return res.status(500).json({ error: "Google Maps API key is missing" });
    }

    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
          input,
        )}&key=${GOOGLE_MAPS_API_KEY}&components=country:${country}`,
      );

      const data = await response.json();
      return res.json(data);
    } catch (error: any) {
      console.error("Error fetching Google Maps API:", error);
      return res.status(500).json({ error: error.message });
    }
  }
}
