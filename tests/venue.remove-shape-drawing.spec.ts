import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

vi.mock("../src/utils/redis.util", () => ({
  default: { getClient: () => null },
}));
vi.mock("../src/infrastructure/socket/invalidate", () => ({
  announceAdminQueueChanged: vi.fn(),
}));

const repo = vi.hoisted(() => ({
  createVenue: vi.fn(async (d: Record<string, unknown>) => ({
    id: "v1",
    ...d,
  })),
  updateVenue: vi.fn(async (id: string, d: Record<string, unknown>) => ({
    id,
    ...d,
  })),
  findVenueById: vi.fn(),
  findLiveVenuesWithBoundary: vi.fn(async () => []),
}));
vi.mock("../src/modules/venue/venue.repository", () => ({ default: repo }));

vi.mock("../src/modules/appointment/appointment.access", () => ({
  default: {
    canOnVenue: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock(
  "../src/modules/cancellation-policy/cancellation-policy.service",
  () => ({
    default: {
      resolvePolicy: vi.fn().mockResolvedValue("policy-1"),
    },
  }),
);

const { default: VenueSvc } =
  await import("../src/modules/venue/venue.service");
const { default: VenueCtrl } =
  await import("../src/modules/venue/venue.controller");

type Result = { statusCode: number; body: any };

function call(
  handler: (req: Request, res: Response) => Promise<unknown>,
  body: Record<string, unknown>,
  params: Record<string, string> = {},
): Promise<Result> {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  const req = {
    user: { userId: "m1", systemRole: "user" },
    body,
    params,
  } as unknown as Request;
  return handler(req, res as unknown as Response).then(() => res as Result);
}

describe("Venue - Remove Shape-Drawing Functionality (api#438)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validVenueData = {
    name: "Pine Hall",
    description: "A spacious outdoor garden venue for intimate events and acoustic gigs.",
    category: "outdoor",
    capacity: 150,
    address: "12 Session Road",
    country: "Philippines",
    state: "Benguet",
    city: "City of Baguio",
    district: "Ambiong",
    lat: 16.4153,
    lng: 120.5921,
    imgIds: ["img-1", "img-2"],
  };

  it("successfully creates and submits a venue for review without a boundary (FE/BE api#438)", async () => {
    const res = await call(VenueCtrl.createVenue, {
      ...validVenueData,
      status: "pending",
    });

    if (res.statusCode !== 201) {
      throw new Error(`call failed: ${JSON.stringify(res.body)}`);
    }

    expect(res.statusCode).toBe(201);
    expect(repo.createVenue).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Pine Hall",
        status: "pending",
        address: "12 Session Road",
        boundary: undefined,
        lat: 16.4153,
        lng: 120.5921,
      }),
    );
  });

  it("successfully updates and publishes an existing draft venue without a boundary", async () => {
    repo.findVenueById.mockResolvedValue({
      id: "v1",
      mayorId: "m1",
      status: "draft",
      ...validVenueData,
      boundary: null,
      images: [{ id: "img-1" }],
    });

    await VenueSvc.updateVenue({
      id: "v1",
      requesterId: "m1",
      data: {
        status: "pending" as any,
        address: "123 Flora St, Tagaytay",
      },
    });

    expect(repo.updateVenue).toHaveBeenCalledWith(
      "v1",
      expect.objectContaining({
        status: "pending",
        address: "123 Flora St, Tagaytay",
      }),
    );
  });

  it("still validates boundary if one is explicitly provided", async () => {
    await expect(
      VenueSvc.createVenue({
        ...validVenueData,
        status: "pending" as any,
        ownerId: "m1",
        // Degenerate/invalid polygon with fewer than 4 points
        boundary: [
          [120.96, 14.11],
          [120.97, 14.12],
        ] as any,
      }),
    ).rejects.toThrow();
  });
});
