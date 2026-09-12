import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/utils/prisma", () => ({
  prisma: {
    event: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    eventOrganizerAssignment: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("../src/modules/notifications/user-notification.service", () => ({
  default: {
    create: vi.fn().mockResolvedValue({}),
  },
}));

import EventOrganizerService from "../src/modules/event-organizer/event-organizer.service";
import EventOrganizerRepo from "../src/modules/event-organizer/event-organizer.repository";
import { prisma } from "../src/utils/prisma";
import NotificationService from "../src/modules/notifications/user-notification.service";

describe("EventOrganizerService & Repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("EventOrganizerService.assign", () => {
    it("allows the event organizer to assign a delegate and sends a notification", async () => {
      (prisma.event.findUnique as any).mockResolvedValue({
        id: "ev1",
        name: "Neon Festival",
        organizerId: "host1",
      });
      (prisma.user.findUnique as any).mockResolvedValue({
        id: "user2",
        email: "volunteer@example.com",
      });
      (prisma.eventOrganizerAssignment.findUnique as any).mockResolvedValue(null);
      (prisma.eventOrganizerAssignment.create as any).mockResolvedValue({
        eventId: "ev1",
        userId: "user2",
        assignedById: "host1",
        permissions: ["booking:check-in"],
        user: { id: "user2", name: "Volunteer", email: "volunteer@example.com" },
      });

      const res = await EventOrganizerService.assign(
        "ev1",
        "host1",
        "user",
        "volunteer@example.com",
        ["booking:check-in"],
      );

      expect(res.userId).toBe("user2");
      expect(prisma.eventOrganizerAssignment.create).toHaveBeenCalledWith({
        data: {
          eventId: "ev1",
          userId: "user2",
          assignedById: "host1",
          permissions: ["booking:check-in"],
        },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
      expect(NotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user2",
          type: "event_organizer_assigned",
          metadata: { eventId: "ev1", link: "/creator-dashboard/check-in" },
        }),
      );
    });

    it("rejects unauthorized users who are not the organizer or admin", async () => {
      (prisma.event.findUnique as any).mockResolvedValue({
        id: "ev1",
        name: "Neon Festival",
        organizerId: "host1",
      });

      await expect(
        EventOrganizerService.assign("ev1", "attacker", "user", "other@example.com"),
      ).rejects.toThrow(/Unauthorized/);
    });

    it("allows an admin to assign delegates even if not the event organizer", async () => {
      (prisma.event.findUnique as any).mockResolvedValue({
        id: "ev1",
        name: "Neon Festival",
        organizerId: "host1",
      });
      (prisma.user.findUnique as any).mockResolvedValue({
        id: "user2",
        email: "volunteer@example.com",
      });
      (prisma.eventOrganizerAssignment.findUnique as any).mockResolvedValue(null);
      (prisma.eventOrganizerAssignment.create as any).mockResolvedValue({
        eventId: "ev1",
        userId: "user2",
        assignedById: "admin1",
        permissions: ["booking:check-in"],
      });

      const res = await EventOrganizerService.assign(
        "ev1",
        "admin1",
        "admin",
        "volunteer@example.com",
      );
      expect(res.userId).toBe("user2");
    });

    it("rejects duplicate assignment of an existing delegate", async () => {
      (prisma.event.findUnique as any).mockResolvedValue({
        id: "ev1",
        name: "Neon Festival",
        organizerId: "host1",
      });
      (prisma.user.findUnique as any).mockResolvedValue({
        id: "user2",
        email: "volunteer@example.com",
      });
      (prisma.eventOrganizerAssignment.findUnique as any).mockResolvedValue({
        eventId: "ev1",
        userId: "user2",
      });

      await expect(
        EventOrganizerService.assign("ev1", "host1", "user", "volunteer@example.com"),
      ).rejects.toThrow(/Already an organizer/);
    });
  });

  describe("EventOrganizerRepo.isAuthorized", () => {
    it("returns true for the host without checking assignments", async () => {
      (prisma.event.findUnique as any).mockResolvedValue({
        id: "ev1",
        organizerId: "host1",
      });

      const auth = await EventOrganizerRepo.isAuthorized("ev1", "host1", "booking:check-in");
      expect(auth).toBe(true);
      expect(prisma.eventOrganizerAssignment.findUnique).not.toHaveBeenCalled();
    });

    it("returns true for a delegate holding booking:check-in", async () => {
      (prisma.event.findUnique as any).mockResolvedValue({
        id: "ev1",
        organizerId: "host1",
      });
      (prisma.eventOrganizerAssignment.findUnique as any).mockResolvedValue({
        permissions: ["booking:check-in"],
      });

      const auth = await EventOrganizerRepo.isAuthorized("ev1", "delegate1", "booking:check-in");
      expect(auth).toBe(true);
      expect(prisma.eventOrganizerAssignment.findUnique).toHaveBeenCalledWith({
        where: { eventId_userId: { eventId: "ev1", userId: "delegate1" } },
        select: { permissions: true },
      });
    });

    it("returns false for a non-delegate", async () => {
      (prisma.event.findUnique as any).mockResolvedValue({
        id: "ev1",
        organizerId: "host1",
      });
      (prisma.eventOrganizerAssignment.findUnique as any).mockResolvedValue(null);

      const auth = await EventOrganizerRepo.isAuthorized("ev1", "stranger", "booking:check-in");
      expect(auth).toBe(false);
    });
  });
});
