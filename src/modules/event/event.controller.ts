import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export default class EventCtrl {
  // List events. Currently only serves "events I organize" — used by the
  // Republic Feed compose flow (event_announcement post type needs a real
  // Event id, not an EventTemplate id) and the host dashboard.
  static async getEvents(req: Request, res: Response) {
    try {
      const { organizerId, page, limit } = req.query;
      if (!organizerId) {
        return res.status(400).json({ message: "organizerId is required" });
      }

      const pageNum = page ? Math.max(1, Number(page)) : 1;
      const take = limit ? Math.min(Number(limit), 50) : 20;

      const [events, total] = await Promise.all([
        prisma.event.findMany({
          where: { organizerId: String(organizerId) },
          orderBy: { startAt: "desc" },
          skip: (pageNum - 1) * take,
          take,
          select: {
            id: true,
            name: true,
            startAt: true,
            eventStatus: true,
            targetCity: true,
          },
        }),
        prisma.event.count({ where: { organizerId: String(organizerId) } }),
      ]);

      return res.status(200).json({ events, total });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ message: error.message || error });
    }
  }
}
