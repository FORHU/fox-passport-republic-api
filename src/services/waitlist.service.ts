import WaitlistRepo from "../repositories/waitlist.repository";
import { prisma } from "../utils/prisma";
import NotificationService from "../modules/notifications/user-notification.service";
import { sendWaitlistSpotAvailableEmail } from "../utils/emails/waitlist";

const HOLD_DURATION_MINUTES = 15;

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

  static async assignAndNotifyFirstInLine(templateId: string) {
    const entry = await WaitlistRepo.getFirstInLine(templateId);
    if (!entry) return null;

    const holdExpiresAt = new Date(
      Date.now() + HOLD_DURATION_MINUTES * 60 * 1000,
    );

    await WaitlistRepo.markAsAssigned(entry.id, holdExpiresAt);

    const template = await prisma.eventTemplate.findUnique({
      where: { id: templateId },
      select: { name: true },
    });

    const eventName = template?.name ?? "the event";

    try {
      await NotificationService.create({
        userId: entry.userId,
        type: "WAITLIST_SPOT_OPENED",
        title: "Spot Available!",
        message: `A spot has opened up for ${eventName}. Complete your booking to secure your spot.`,
        metadata: {
          link: `/booking/config?templateId=${templateId}&claimed=1`,
        },
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

  static async validateHold(templateId: string, userId: string) {
    const entry = await WaitlistRepo.findAssignedEntry(templateId, userId);
    if (!entry) return false;
    if (!entry.holdExpiresAt) return false;
    return entry.holdExpiresAt.getTime() > Date.now();
  }

  static async markAsConverted(templateId: string, userId: string) {
    await WaitlistRepo.markAsConverted(templateId, userId);
  }
}
