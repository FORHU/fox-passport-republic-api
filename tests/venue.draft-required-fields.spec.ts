import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

/**
 * api#365: Venue Studio's Save Draft sends only what is filled so far, so a
 * venue draft needs only a name. Its required columns are stored blank, and
 * publishing - on create or later from the draft - needs the full set,
 * including at least one image. The repository is stubbed; the controller and
 * service are real.
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

const boundary = [
  [120.59, 16.41],
  [120.6, 16.41],
  [120.6, 16.42],
  [120.59, 16.42],
];

// Everything a venue needs to publish.
const complete = {
  name: "Pine Hall",
  description: "A hall among the pines",
  category: "outdoor",
  capacity: 50,
  address: "12 Session Road",
  country: "Philippines",
  state: "Benguet",
  city: "City of Baguio",
  district: "Ambiong",
  boundary,
  imgIds: ["img-1"],
};

// A stored draft saved with only a name: its required columns are blank.
const blankDraft = {
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
  images: [],
};

beforeEach(() => vi.clearAllMocks());

describe("Saving a new venue as a draft", () => {
  it("needs only a name, and stores the required columns blank", async () => {
    const { statusCode } = await call(VenueCtrl.createVenue, {
      name: "Pine Hall",
      status: "draft",
    });

    expect(statusCode).toBe(201);
    expect(repo.createVenue).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Pine Hall",
        status: "draft",
        description: "",
        category: "",
        capacity: 0,
        address: "",
        city: "",
        country: "",
        imgIds: [],
      }),
    );
  });

  it("keeps what was filled in", async () => {
    await call(VenueCtrl.createVenue, {
      name: "Pine Hall",
      status: "draft",
      description: "Half done",
      city: "City of Baguio",
    });

    expect(repo.createVenue).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Half done",
        city: "City of Baguio",
        category: "",
      }),
    );
  });

  it("still needs a name", async () => {
    const { statusCode } = await call(VenueCtrl.createVenue, {
      status: "draft",
    });

    expect(statusCode).toBe(400);
    expect(repo.createVenue).not.toHaveBeenCalled();
  });
});

describe("Creating a venue for review needs every publish field", () => {
  it.each([
    "description",
    "category",
    "capacity",
    "address",
    "city",
    "country",
    "imgIds",
  ])("refuses one without %s", async (field) => {
    const body: Record<string, unknown> = { ...complete };
    delete body[field];

    const { statusCode } = await call(VenueCtrl.createVenue, body);

    expect(statusCode).toBe(400);
    expect(repo.createVenue).not.toHaveBeenCalled();
  });

  it("refuses one with no image", async () => {
    const { statusCode } = await call(VenueCtrl.createVenue, {
      ...complete,
      imgIds: [],
    });

    expect(statusCode).toBe(400);
    expect(repo.createVenue).not.toHaveBeenCalled();
  });

  it("accepts a complete one", async () => {
    const { statusCode } = await call(VenueCtrl.createVenue, complete);

    expect(statusCode).toBe(201);
    expect(repo.createVenue).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending" }),
    );
  });
});

describe("Publishing a draft later", () => {
  const publish = (data: Record<string, unknown>) =>
    VenueSvc.updateVenue({
      id: "v1",
      requesterId: "m1",
      data: { status: "pending", ...data } as never,
    });

  it("refuses a draft saved with only a name", async () => {
    repo.findVenueById.mockResolvedValue(blankDraft);

    await expect(publish({})).rejects.toThrow(
      "Add a description before publishing",
    );
    expect(repo.updateVenue).not.toHaveBeenCalled();
  });

  it.each([
    ["category", { category: "" }, "Pick a venue category before publishing"],
    ["capacity", { capacity: 0 }, "Capacity must be at least 1"],
    ["city", { city: "" }, "City and country are required to publish a venue"],
    [
      "country",
      { country: "" },
      "City and country are required to publish a venue",
    ],
    ["image", { imgIds: [] }, "Add at least one image before publishing"],
    [
      "street",
      { address: " " },
      "A street address is required to publish a venue",
    ],
  ])("refuses one with no %s", async (_name, missing, message) => {
    repo.findVenueById.mockResolvedValue(blankDraft);

    await expect(publish({ ...complete, ...missing })).rejects.toThrow(message);
    expect(repo.updateVenue).not.toHaveBeenCalled();
  });

  it("publishes once the draft is complete, counting its saved images", async () => {
    repo.findVenueById.mockResolvedValue({
      ...blankDraft,
      ...complete,
      imgIds: undefined,
      images: [{ id: "img-1" }],
    });

    await publish({});

    expect(repo.updateVenue).toHaveBeenCalledWith(
      "v1",
      expect.objectContaining({ status: "pending" }),
    );
  });

  it("lets a draft be re-saved as a draft while still incomplete", async () => {
    repo.findVenueById.mockResolvedValue(blankDraft);

    await VenueSvc.updateVenue({
      id: "v1",
      requesterId: "m1",
      data: { status: "draft", description: "More" } as never,
    });

    expect(repo.updateVenue).toHaveBeenCalled();
  });
});

describe("Editing a venue that is already out of draft", () => {
  const live = {
    ...blankDraft,
    ...complete,
    status: "available",
    images: [{ id: "img-1" }],
  };

  it("refuses removing every image", async () => {
    repo.findVenueById.mockResolvedValue(live);

    await expect(
      VenueSvc.updateVenue({
        id: "v1",
        requesterId: "m1",
        data: { imgIds: [] } as never,
      }),
    ).rejects.toThrow("Add at least one image before publishing");
  });

  it("still lets an older venue without images be edited", async () => {
    repo.findVenueById.mockResolvedValue({ ...live, images: [] });

    await VenueSvc.updateVenue({
      id: "v1",
      requesterId: "m1",
      data: { description: "New words" } as never,
    });

    expect(repo.updateVenue).toHaveBeenCalled();
  });
});
