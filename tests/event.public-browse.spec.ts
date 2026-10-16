import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/utils/prisma", () => ({
  prisma: {
    event: {
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { prisma } from "../src/utils/prisma";
import EventRepo from "../src/modules/event/event.repository";

const eventMock = prisma.event as unknown as Record<
  string,
  ReturnType<typeof vi.fn>
>;

beforeEach(() => {
  vi.clearAllMocks();
  eventMock.findMany.mockResolvedValue([]);
  eventMock.count.mockResolvedValue(0);
  eventMock.updateMany.mockResolvedValue({ count: 1 });
});

describe("public event browse", () => {
  it("filters to published upcoming events and applies search constraints", async () => {
    const now = new Date("2026-10-14T05:00:00.000Z");
    const toDate = new Date("2026-11-01T00:00:00.000Z");
    await EventRepo.findPublicEvents({
      city: "Manila",
      query: "festival",
      minPrice: 1000,
      maxPrice: 5000,
      minCapacity: 20,
      fromDate: new Date("2026-10-13T00:00:00.000Z"),
      toDate,
      sortBy: "price_asc",
      page: 2,
      limit: 10,
      now,
    });

    expect(eventMock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isPublic: true,
          requestStatus: "approved",
          startAt: { gte: now, lt: toDate },
          targetCity: { contains: "Manila", mode: "insensitive" },
          name: { contains: "festival", mode: "insensitive" },
          totalAmount: { gte: 1000, lte: 5000 },
          guestCount: { gte: 20 },
        }),
        orderBy: [{ totalAmount: "asc" }, { startAt: "asc" }],
        skip: 10,
        take: 10,
      }),
    );
    const select = eventMock.findMany.mock.calls[0][0].select;
    expect(select).not.toHaveProperty("clientId");
    expect(select).not.toHaveProperty("organizerId");
    expect(select).not.toHaveProperty("host");
  });

  it("only changes visibility for the owning client and publishable events", async () => {
    await EventRepo.setPublicVisibility(
      "event-1",
      "client-1",
      true,
      new Date("2026-10-14T05:00:00.000Z"),
    );

    expect(eventMock.updateMany).toHaveBeenCalledWith({
      where: {
        id: "event-1",
        clientId: "client-1",
        requestStatus: "approved",
        eventStatus: { notIn: ["cancelled", "completed"] },
        startAt: { gt: new Date("2026-10-14T05:00:00.000Z") },
      },
      data: { isPublic: true },
    });
  });
});
