import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";

export default class AnalyticsSvc {
  // Per-template booking stats for an eventFoxer — gated by analytics_pro perk
  static async getEventStats(ownerId: string) {
    const templates = await prisma.eventTemplate.findMany({
      where: { ownerId },
      select: {
        id: true,
        name: true,
        category: true,
        events: {
          select: {
            id: true,
            totalAmount: true,
            guestCount: true,
            eventStatus: true,
            startAt: true,
            bookings: {
              select: {
                id: true,
                totalAmount: true,
                status: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    return templates.map((t) => {
      const allBookings = t.events.flatMap((e) => e.bookings);
      const confirmedBookings = allBookings.filter((b) =>
        ["confirmed", "completed"].includes(b.status),
      );
      const revenue = confirmedBookings.reduce(
        (s, b) => s.add(b.totalAmount),
        new Prisma.Decimal(0),
      );
      const totalGuests = t.events.reduce((s, e) => s + (e.guestCount ?? 0), 0);
      const completedEvents = t.events.filter(
        (e) => e.eventStatus === "completed",
      ).length;

      // Bookings bucketed by month (last 6 months)
      const now = new Date();
      const monthlyBuckets: Record<string, number> = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        monthlyBuckets[key] = 0;
      }
      for (const b of allBookings) {
        const key = `${b.createdAt.getFullYear()}-${String(b.createdAt.getMonth() + 1).padStart(2, "0")}`;
        if (key in monthlyBuckets) monthlyBuckets[key]++;
      }

      return {
        templateId: t.id,
        templateName: t.name,
        category: t.category,
        totalEvents: t.events.length,
        completedEvents,
        totalBookings: allBookings.length,
        confirmedBookings: confirmedBookings.length,
        revenue: Math.round(revenue.toNumber() * 100) / 100,
        totalGuests,
        monthlyBookings: Object.entries(monthlyBuckets).map(
          ([month, count]) => ({ month, count }),
        ),
      };
    });
  }
}
