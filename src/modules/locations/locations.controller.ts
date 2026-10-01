import { Request, Response } from "express";
import LocationsSvc, { GeoDirectory } from "./locations.service";

// Reference data that changes only with a dataset upgrade.
const ONE_DAY = "public, max-age=86400";

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

  // GET /locations/countries
  static countries(_req: Request, res: Response) {
    res.set("Cache-Control", ONE_DAY);
    return res
      .status(200)
      .json({ status: "success", data: GeoDirectory.countries() });
  }

  // GET /locations/countries/:countryCode/states
  static states(req: Request, res: Response) {
    res.set("Cache-Control", ONE_DAY);
    return res.status(200).json({
      status: "success",
      data: GeoDirectory.states(req.params.countryCode),
    });
  }

  // GET /locations/countries/:countryCode/cities?state=XX
  // Without `state`, the whole country — for countries with no states.
  static cities(req: Request, res: Response) {
    const state = typeof req.query.state === "string" ? req.query.state : "";
    res.set("Cache-Control", ONE_DAY);
    return res.status(200).json({
      status: "success",
      data: GeoDirectory.cities(req.params.countryCode, state || undefined),
    });
  }

  // GET /locations/nearest?lat=..&lng=.. — browser geolocation → place.
  static nearest(req: Request, res: Response) {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      return res
        .status(400)
        .json({ status: "error", message: "lat and lng are required" });
    }
    return res
      .status(200)
      .json({ status: "success", data: GeoDirectory.nearest(lat, lng) });
  }
}
