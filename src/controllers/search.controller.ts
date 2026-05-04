import { Request, Response } from "express";
import { performSearch } from "../services/search.service";

export const search = async (req: Request, res: Response) => {
  try {
    const filters = req.query;
    const result = await performSearch(filters);

    let message;
    if (result.results.length === 0) {
      const hasLocation = !!(filters.city || filters.country);
      const hasDates = !!(filters.startDate && filters.endDate);
      
      if (hasLocation && hasDates) {
        message = "No events found for the selected location and date range.";
      } else if (hasLocation) {
        message = "No events found for this location.";
      } else if (hasDates) {
        message = "No events found for the selected dates.";
      } else {
        message = "No events found.";
      }
    }

    res.status(200).json({
      status: "success",
      data: result,
      ...(message && { message })
    });
  } catch (error: any) {
    console.error("Search error:", error);
    res.status(500).json({
      status: "error",
      message: error.message || "Failed to perform search",
    });
  }
};
