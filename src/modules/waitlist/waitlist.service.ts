import WaitlistRepo from "./waitlist.repository";
import { prisma } from "../../utils/prisma";
import NotificationService from "../notifications/user-notification.service";
import { sendWaitlistSpotAvailableEmail } from "../../utils/emails/waitlist";

export default class WaitlistSvc {
  static async getCurrentAttendees(templateId: string): Promise<number> {
    const events = await prisma.event.findMany({
      where: { templateId },
      select: { id: true },
    });
    if (events.length === 0) return 0;

    const result = await prisma.booking.aggregate({
      where: {
        eventId: { in: events.map((e) => e.id) },
        status: { notIn: ["cancelled"] },
      },
      _sum: { guestCount: true },
    });
    return result._sum.guestCount ?? 0;
  }

  static async joinWaitlist(templateId: string, userId: string) {
    const template = await prisma.eventTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, maxAttendees: true, name: true },
    });
    if (!template) throw new Error("Template not found");
    if (!template.maxAttendees) {
      throw new Error(
        "This event has no capacity limit — you can book directly",
      );
    }

    const existing = await WaitlistRepo.findEntry(templateId, userId);
    if (existing)
      throw new Error("You are already on the waitlist for this event");

    const currentAttendees = await this.getCurrentAttendees(templateId);
    if (currentAttendees < template.maxAttendees) {
      throw new Error("This event is not at capacity — book directly instead");
    }

    const entry = await WaitlistRepo.create(templateId, userId);
    const position = await WaitlistRepo.getPosition(templateId, userId);
    const totalWaiting = await WaitlistRepo.countByTemplate(templateId);

    return { entry, position, totalWaiting };
  }

  static async leaveWaitlist(entryId: string, userId: string) {
    const entry = await prisma.waitlist.findUnique({ where: { id: entryId } });
    if (!entry) throw new Error("Waitlist entry not found");
    if (entry.userId !== userId) throw new Error("Unauthorized");

    await WaitlistRepo.remove(entryId);
  }

  static async getWaitlistStatus(templateId: string, userId?: string) {
    const totalWaiting = await WaitlistRepo.countByTemplate(templateId);

    if (!userId) {
      return {
        isOnWaitlist: false,
        position: null,
        entryId: null,
        totalWaiting,
      };
    }

    const entry = await WaitlistRepo.findEntry(templateId, userId);
    if (!entry) {
      return {
        isOnWaitlist: false,
        position: null,
        entryId: null,
        totalWaiting,
      };
    }

    const position = await WaitlistRepo.getPosition(templateId, userId);
    return { isOnWaitlist: true, position, entryId: entry.id, totalWaiting };
  }

  static async notifyFirstInLine(templateId: string) {
    const entry = await WaitlistRepo.getFirstInLine(templateId);
    if (!entry) return null;

    const template = await prisma.eventTemplate.findUnique({
      where: { id: templateId },
      select: { name: true },
    });

    const eventName = template?.name ?? "the event";

    try {
      await NotificationService.create({
        userId: entry.userId,
        type: "waitlist_spot_available",
        title: "A spot opened up!",
        message: `A spot just opened for "${eventName}". Book now before it fills up again.`,
        metadata: { templateId },
      });
    } catch (err) {
      console.error("Failed to create waitlist notification:", err);
    }

    try {
      if (entry.user?.email) {
        await sendWaitlistSpotAvailableEmail({
          to: entry.user.email,
          eventName,
          templateId,
        });
      }
    } catch (err) {
      console.error("Failed to send waitlist email:", err);
    }

    return entry;
  }
}
