import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

/**
 * mobile#498: a venue says how far it serves - local, municipal, city,
 * province, national or international - instead of a drawn radius. Optional,
 * so venues saved before it keep working. The repository is stubbed; the
 * controller and service are real.
 */

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

// A draft the owner already has, saved before coverage existed.
const saved = {
  id: "v1",
  mayorId: "m1",
  status: "draft",
  name: "Pine Hall",
  description: "",
  category: "",
  capacity: 0,
  address: "",
  city: "",
  country: "",
  state: null,
  district: null,
  boundary: null,
  coverageArea: null,
  images: [],
};

beforeEach(() => vi.clearAllMocks());

describe("A venue's coverage area", () => {
  it.each([
    "local",
    "municipal",
    "city",
    "province",
    "national",
    "international",
  ])("is saved when a venue is created: %s", async (coverageArea) => {
    const { statusCode } = await call(VenueCtrl.createVenue, {
      name: "Pine Hall",
      status: "draft",
      coverageArea,
    });

    expect(statusCode).toBe(201);
    expect(repo.createVenue).toHaveBeenCalledWith(
      expect.objectContaining({ coverageArea }),
    );
  });

  it("is optional, so a venue without one is created as before", async () => {
    const { statusCode } = await call(VenueCtrl.createVenue, {
      name: "Pine Hall",
      status: "draft",
    });

    expect(statusCode).toBe(201);
    expect(repo.createVenue.mock.calls[0][0]).not.toHaveProperty(
      "coverageArea",
    );
  });

  it("refuses anything but the six areas, and says which they are", async () => {
    const { statusCode, body } = await call(VenueCtrl.createVenue, {
      name: "Pine Hall",
      status: "draft",
      coverageArea: "galaxy",
    });

    expect(statusCode).toBe(400);
    expect(JSON.stringify(body)).toContain(
      "local, municipal, city, province, national, international",
    );
    expect(repo.createVenue).not.toHaveBeenCalled();
  });

  it("changes on the same venue when edited, leaving the rest alone", async () => {
    repo.findVenueById.mockResolvedValue(saved);

    const { statusCode } = await call(
      VenueCtrl.updateVenue,
      { coverageArea: "province" },
      { id: "v1" },
    );

    expect(statusCode).toBe(200);
    expect(repo.createVenue).not.toHaveBeenCalled();
    expect(repo.updateVenue).toHaveBeenCalledTimes(1);
    const [id, data] = repo.updateVenue.mock.calls[0];
    expect(id).toBe("v1");
    expect(data).toMatchObject({ coverageArea: "province" });
    expect(data).not.toHaveProperty("name");
    expect(data).not.toHaveProperty("description");
  });

  it("can be cleared on an edit", async () => {
    repo.findVenueById.mockResolvedValue({ ...saved, coverageArea: "city" });

    const { statusCode } = await call(
      VenueCtrl.updateVenue,
      { coverageArea: null },
      { id: "v1" },
    );

    expect(statusCode).toBe(200);
    expect(repo.updateVenue).toHaveBeenCalledWith(
      "v1",
      expect.objectContaining({ coverageArea: null }),
    );
  });
});
