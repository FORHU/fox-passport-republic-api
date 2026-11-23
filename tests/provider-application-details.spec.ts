import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * mobile#487 / api#440: the Provider wizard sends where the applicant is
 * based, how far they travel, their main specialty, and per specialty a line
 * and photos of their work. The controller checks the shape; the service
 * checks the photos are the applicant's own images and stores them as rows.
 */

const prisma = vi.hoisted(() => ({
  file: { count: vi.fn(), findMany: vi.fn() },
}));
vi.mock("../src/utils/prisma", () => ({ prisma }));

const repo = vi.hoisted(() => ({
  findPendingRequest: vi.fn(async () => null),
  createRequest: vi.fn(async (_u, _r, data: object) => ({ id: "req-1", data })),
}));
vi.mock("../src/modules/role-request/role-request.repository", () => ({
  default: repo,
}));
vi.mock("../src/modules/users/users.repository", () => ({
  default: { findUserById: vi.fn(async () => ({ id: "u1", roleType: [] })) },
}));
vi.mock("../src/modules/notifications/user-notification.service", () => ({
  default: {},
}));

const { checkProviderDetails, MAX_SPECIALTY_PHOTOS } =
  await import("../src/modules/role-request/role-request.controller");
const { default: RoleRequestService } =
  await import("../src/modules/role-request/role-request.service");

const base = () => ({ specializations: ["sound_system", "dj"] });

describe("checkProviderDetails", () => {
  it("keeps an application without the wizard's answers as it was, main defaulting to the first", () => {
    const data: Record<string, unknown> = base();
    expect(checkProviderDetails(data)).toBeNull();
    expect(data).toEqual({
      specializations: ["sound_system", "dj"],
      mainSpecialty: "sound_system",
    });
  });

  it("cleans and keeps valid answers", () => {
    const data: Record<string, unknown> = {
      ...base(),
      basedIn: "  Cebu City, Cebu ",
      travelRange: "province",
      mainSpecialty: "dj",
      specialtyDetails: [
        {
          slug: "dj",
          description: "  Weddings and parties ",
          photoFileIds: ["f1", "f1", "f2"],
        },
      ],
    };
    expect(checkProviderDetails(data)).toBeNull();
    expect(data).toMatchObject({
      basedIn: "Cebu City, Cebu",
      travelRange: "province",
      mainSpecialty: "dj",
      specialtyDetails: [
        {
          slug: "dj",
          description: "Weddings and parties",
          photoFileIds: ["f1", "f2"],
        },
      ],
    });
  });

  it("keeps a located position, both coordinates together", () => {
    const data: Record<string, unknown> = {
      ...base(),
      basedIn: "Cebu City, Cebu",
      basedInLat: 10.3157,
      basedInLng: 123.8854,
    };
    expect(checkProviderDetails(data)).toBeNull();
    expect(data).toMatchObject({ basedInLat: 10.3157, basedInLng: 123.8854 });
  });

  it.each([
    [{ basedInLat: 10.3 }, "latitude and longitude"],
    [{ basedInLat: 91, basedInLng: 0 }, "latitude and longitude"],
    [{ basedInLat: "10", basedInLng: "123" }, "latitude and longitude"],
    [{ travelRange: "region" }, "Travel range"],
    [{ mainSpecialty: "catering" }, "main specialty"],
    [{ basedIn: "x".repeat(121) }, "120 characters"],
    [{ specialtyDetails: "dj" }, "must be a list"],
    [
      { specialtyDetails: [{ slug: "catering", description: "x" }] },
      "did not pick",
    ],
    [
      {
        specialtyDetails: [
          { slug: "dj", description: "a" },
          { slug: "dj", description: "b" },
        ],
      },
      "twice",
    ],
    [{ specialtyDetails: [{ slug: "dj", description: "  " }] }, "Add a line"],
    [
      { specialtyDetails: [{ slug: "dj", description: "x".repeat(501) }] },
      "500 characters",
    ],
    [
      {
        specialtyDetails: [
          {
            slug: "dj",
            description: "x",
            photoFileIds: Array.from({ length: 7 }, (_, i) => `f${i}`),
          },
        ],
      },
      `${MAX_SPECIALTY_PHOTOS} photos`,
    ],
    [
      {
        specialtyDetails: [{ slug: "dj", description: "x", photoFileIds: [3] }],
      },
      "uploaded files",
    ],
  ])("refuses %o", (extra, message) => {
    const data: Record<string, unknown> = { ...base(), ...extra };
    expect(checkProviderDetails(data)).toContain(message);
  });
});

describe("RoleRequestService.submitApplication: specialty details", () => {
  const details = [
    { slug: "dj", description: "Weddings", photoFileIds: ["f1", "f2"] },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.file.count.mockResolvedValue(2);
    prisma.file.findMany.mockResolvedValue([
      { type: "image/jpeg" },
      { type: "image/png" },
    ]);
  });

  it("stores each specialty with its photos in order", async () => {
    await RoleRequestService.submitApplication("u1", "providerFoxer", {
      ...base(),
      specialtyDetails: details,
    });

    const data = repo.createRequest.mock.calls[0][2] as Record<string, any>;
    expect(data.specialtyDetails).toEqual({
      create: [
        {
          slug: "dj",
          description: "Weddings",
          photos: {
            create: [
              { fileId: "f1", position: 0 },
              { fileId: "f2", position: 1 },
            ],
          },
        },
      ],
    });
  });

  it("refuses a photo the applicant did not upload", async () => {
    prisma.file.count.mockResolvedValue(1);
    await expect(
      RoleRequestService.submitApplication("u1", "providerFoxer", {
        ...base(),
        specialtyDetails: details,
      }),
    ).rejects.toThrow("could not be found");
    expect(repo.createRequest).not.toHaveBeenCalled();
  });

  it("refuses a work photo that is not an image", async () => {
    prisma.file.findMany.mockResolvedValue([
      { type: "image/jpeg" },
      { type: "application/pdf" },
    ]);
    await expect(
      RoleRequestService.submitApplication("u1", "providerFoxer", {
        ...base(),
        specialtyDetails: details,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(repo.createRequest).not.toHaveBeenCalled();
  });

  it("drops the field for other roles", async () => {
    await RoleRequestService.submitApplication("u1", "eventFoxer", {
      specializations: [],
      specialtyDetails: details,
    });
    const data = repo.createRequest.mock.calls[0][2] as Record<string, any>;
    expect(data.specialtyDetails).toBeUndefined();
  });
});
