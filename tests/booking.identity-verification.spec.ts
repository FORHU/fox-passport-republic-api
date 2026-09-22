import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const db = vi.hoisted(() => ({
  users: [] as Array<{ id: string; isEmailVerified: boolean }>,
  venues: [] as Array<{
    id: string;
    name: string;
    description: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    mayorId: string;
    price: Prisma.Decimal;
    billingRate: string;
    category: string;
    capacity: number;
    extraGuestRate: Prisma.Decimal | null;
  }>,
}));

vi.mock("../src/utils/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return db.users.find((u) => u.id === where.id) ?? null;
      }),
    },
    venue: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return db.venues.find((v) => v.id === where.id) ?? null;
      }),
    },
    event: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "event-1",
        ...data,
      })),
    },
    eventVenueTransaction: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    $transaction: vi.fn(async (callback: (tx: any) => any) => {
      const tx = {
        eventVenueTransaction: {
          create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data),
        },
      };
      return callback(tx);
    }),
  },
}));

vi.mock("../src/modules/booking/booking.repository", () => ({
  default: {
    create: vi.fn(async (payload: Record<string, unknown>) => ({
      id: "booking-1",
      ...payload,
    })),
  },
}));

vi.mock("../src/modules/payment/payment.service", () => ({
  default: {
    createPayment: vi.fn(async () => ({ id: "payment-1" })),
  },
}));

vi.mock("../src/modules/availability/availability.service", () => ({
  default: {
    reserve: vi.fn(async () => undefined),
  },
}));

vi.mock("../src/infrastructure/socket/invalidate", () => ({
  announceToUser: vi.fn(),
  announceToAdmins: vi.fn(),
  announceAdminQueueChanged: vi.fn(),
}));

vi.mock("../src/modules/passport/passport.service", () => ({
  default: {
    awardXP: vi.fn(async () => undefined),
  },
  XP_REWARDS: { bookEvent: 50 },
  UserPath: { user: "user" },
}));

import BookingSvc from "../src/modules/booking/booking.service";

beforeEach(() => {
  db.users = [{ id: "u1", isEmailVerified: false }];
  db.venues = [
    {
      id: "v1",
      name: "Venue A",
      description: "A test venue",
      city: "Manila",
      state: "Metro Manila",
      country: "Philippines",
      mayorId: "m1",
      price: new Prisma.Decimal("100.00"),
      billingRate: "daily",
      category: "indoor",
      capacity: 10,
      extraGuestRate: new Prisma.Decimal("25.00"),
    },
  ];
  vi.clearAllMocks();
});

describe("booking verification", () => {
  it("blocks a citizen whose email is not verified", async () => {
    await expect(
      BookingSvc.createBooking({
        userId: "u1",
        venueId: "v1",
        startDate: "2026-01-01T10:00:00.000Z",
        endDate: "2026-01-02T10:00:00.000Z",
        guestCount: 2,
      }),
    ).rejects.toThrow("Identity verification required before booking");
  });
});
