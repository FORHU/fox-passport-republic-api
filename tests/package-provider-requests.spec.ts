import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * api#459: every Provider added to a package gets a request. Adding a listing
 * makes a matched line that waits for its Supplier's answer, unless the
 * listing is the Event Foxer's own, a venue (only its Mayor or an approved
 * affiliate can add one), or a partner's (it accepted one of their requests
 * before). Making a line optional or required keeps it and its answer. The
 * repository and Prisma are stubbed; the service is real.
 */

const HOST = "ef-1";
const PROVIDER = "provider-1";

const repo = vi.hoisted(() => ({
  findTemplateById: vi.fn(),
  attachAsset: vi.fn(async () => ({ id: "line-a" })),
  attachService: vi.fn(async () => ({ id: "line-s" })),
  attachVenue: vi.fn(async () => ({ id: "line-v" })),
  setLineOptional: vi.fn(async () => ({ count: 1 })),
}));
vi.mock("../src/modules/event-template/event-template.repository", () => ({
  default: repo,
}));

const db = vi.hoisted(() => ({
  asset: { findUnique: vi.fn() },
  service: { findUnique: vi.fn() },
  venue: { findUnique: vi.fn() },
  eventTemplateAsset: { findMany: vi.fn(async () => []) },
  eventTemplateService: { findMany: vi.fn(async () => []) },
  eventTemplateVenue: { findMany: vi.fn(async () => []) },
}));
vi.mock("../src/utils/prisma", () => ({ prisma: db }));

const affiliations = vi.hoisted(() => ({
  getApprovedAffiliationWithPermission: vi.fn(),
}));
vi.mock("../src/modules/venue-affiliation/venue-affiliation.service", () => ({
  default: affiliations,
}));

const { default: EventTemplateSvc } =
  await import("../src/modules/event-template/event-template.service");

const price = (n: number) => ({ toNumber: () => n });

beforeEach(() => {
  vi.clearAllMocks();
  db.eventTemplateAsset.findMany.mockResolvedValue([]);
  db.eventTemplateService.findMany.mockResolvedValue([]);
  repo.setLineOptional.mockResolvedValue({ count: 1 });
  repo.findTemplateById.mockResolvedValue({
    id: "tpl-1",
    ownerId: HOST,
    templateVenues: [],
  });
  db.asset.findUnique.mockResolvedValue({
    id: "asset-1",
    ownerId: PROVIDER,
    price: price(5000),
  });
  db.service.findUnique.mockResolvedValue({
    id: "svc-1",
    ownerId: PROVIDER,
    price: price(8000),
  });
  db.venue.findUnique.mockResolvedValue({
    id: "venue-1",
    mayorId: "mayor-1",
    status: "available",
    price: price(30000),
  });
  affiliations.getApprovedAffiliationWithPermission.mockResolvedValue(null);
});

/** The match fields the repository was asked to write for the new line. */
const matchOf = (fn: typeof repo.attachAsset, at: number) =>
  (fn.mock.calls[0] as unknown[])[at] as Record<string, unknown>;

describe("adding a listing to a package", () => {
  it("asks another Provider's gear: the line waits for their answer", async () => {
    await EventTemplateSvc.attachAsset("tpl-1", HOST, "asset-1");

    expect(matchOf(repo.attachAsset, 3)).toEqual({
      matched: true,
      matchRequestStatus: "pending",
      respondedAt: null,
    });
  });

  it("asks another Provider's service too", async () => {
    await EventTemplateSvc.attachService("tpl-1", HOST, "svc-1");

    expect(matchOf(repo.attachService, 2)).toMatchObject({
      matched: true,
      matchRequestStatus: "pending",
    });
  });

  it("adds the Event Foxer's own listing as accepted", async () => {
    db.service.findUnique.mockResolvedValue({
      id: "svc-1",
      ownerId: HOST,
      price: price(8000),
    });

    await EventTemplateSvc.attachService("tpl-1", HOST, "svc-1");

    expect(matchOf(repo.attachService, 2)).toMatchObject({
      matchRequestStatus: "accepted",
      respondedAt: expect.any(Date),
    });
  });

  it("adds a partner's listing (accepted this Event Foxer before) as accepted", async () => {
    db.eventTemplateAsset.findMany.mockResolvedValue([
      { assetId: "asset-1" },
    ] as never);

    await EventTemplateSvc.attachAsset("tpl-1", HOST, "asset-1");

    expect(db.eventTemplateAsset.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        template: { ownerId: HOST },
        matched: true,
        matchRequestStatus: { in: ["accepted", "secured"] },
        assetId: { in: ["asset-1"] },
      }),
      select: { assetId: true },
    });
    expect(matchOf(repo.attachAsset, 3)).toMatchObject({
      matchRequestStatus: "accepted",
    });
  });

  it("asks any venue's Mayor, as it asks any Provider", async () => {
    await EventTemplateSvc.attachVenue("tpl-1", HOST, "venue-1");

    expect(matchOf(repo.attachVenue, 2)).toMatchObject({
      matched: true,
      matchRequestStatus: "pending",
    });
  });

  it("adds a venue as accepted when the Mayor approved an affiliation: a partner", async () => {
    affiliations.getApprovedAffiliationWithPermission.mockResolvedValue({
      agreedPrice: null,
    });

    await EventTemplateSvc.attachVenue("tpl-1", HOST, "venue-1");

    expect(matchOf(repo.attachVenue, 2)).toMatchObject({
      matched: true,
      matchRequestStatus: "accepted",
    });
  });

  it("won't add another Mayor's venue that isn't taking bookings", async () => {
    db.venue.findUnique.mockResolvedValue({
      id: "venue-1",
      mayorId: "mayor-1",
      status: "draft",
      price: price(30000),
    });

    await expect(
      EventTemplateSvc.attachVenue("tpl-1", HOST, "venue-1"),
    ).rejects.toMatchObject({ status: 400 });
    expect(repo.attachVenue).not.toHaveBeenCalled();
  });

  it("keeps pinning a match-search line to the package's state", async () => {
    await EventTemplateSvc.attachAsset(
      "tpl-1",
      HOST,
      "asset-1",
      1,
      "Two speakers",
      new Date("2026-12-12"),
    );

    expect(matchOf(repo.attachAsset, 3)).toMatchObject({
      matchRequestStatus: "pending",
      matchConstraint: "SAME_STATE",
    });
  });
});

describe("making a line optional or required", () => {
  it("changes only the flag, keeping the line and its answer", async () => {
    const result = await EventTemplateSvc.setLineOptional(
      "tpl-1",
      HOST,
      "service",
      "svc-1",
      true,
    );

    expect(repo.setLineOptional).toHaveBeenCalledWith(
      "service",
      "tpl-1",
      "svc-1",
      true,
    );
    expect(result).toEqual({
      templateId: "tpl-1",
      kind: "service",
      listingId: "svc-1",
      isOptional: true,
    });
  });

  it("is the package owner's alone", async () => {
    await expect(
      EventTemplateSvc.setLineOptional("tpl-1", "someone", "asset", "a", true),
    ).rejects.toMatchObject({ status: 403 });
    expect(repo.setLineOptional).not.toHaveBeenCalled();
  });

  it("says so when the package has no such item", async () => {
    repo.setLineOptional.mockResolvedValue({ count: 0 });

    await expect(
      EventTemplateSvc.setLineOptional("tpl-1", HOST, "venue", "nope", false),
    ).rejects.toMatchObject({ status: 404 });
  });
});
