import { Request, Response } from "express";
import SearchSvc from "../services/search.service";

export default class SearchCtrl {
  // GET /v1/search?location=<city>&category=<cat>
  // Returns event templates, gear foxers, and service foxers relevant to the
  // location (+ optional category) entered by the user.
  static async search(req: Request, res: Response) {
    try {
      const location = req.query.location as string | undefined;
      const category = req.query.category as string | undefined;
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 30));

      const result = await SearchSvc.searchByLocation(location, category, page, limit);

      return res.status(200).json({
        success: true,
        data: {
          location: location ?? null,
          category: category ?? null,
          page,
          limit,
          totalEventTemplates: result.totalEventTemplates,
          totalGearFoxers: result.totalGearFoxers,
          totalServiceFoxers: result.totalServiceFoxers,
          eventTemplates: result.eventTemplates,
          gearFoxers: result.gearFoxers,
          serviceFoxers: result.serviceFoxers,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
