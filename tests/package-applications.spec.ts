import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * api#460: open packages and applications. A package being built (`draft`)
 * is open to Event, Venue and Provider users; a Mayor or Provider applies
 * with one of their live listings for a spot the package doesn't have (one
 * venue; one per category for gear and services). The Event Foxer accepts
 * (the listing joins as an accepted line and the others for that spot are
 * closed) or declines with a reason. Prisma, the attach and notifications are
 * stubbed; the service is real.
 */

const EF = "ef-1";
const PRO = "pro-1";

const db = vi.hoisted(() => ({
  eventTemplate: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  packageApplication: {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(),
    create: vi.fn(async (a: { data: object }) => ({ id: "app-1", ...a.data })),
    updateMany: vi.fn(async () => ({ count: 1 })),
    update: vi.fn(async () => ({})),
  },
  venue: { findUnique: vi.fn(), findMany: vi.fn(async () => []) },
  asset: { findUnique: vi.fn(), findMany: vi.fn(async () => []) },
  service: { findUnique: vi.fn(), findMany: vi.fn(async () => []) },
  eventTemplateVenue: { update: vi.fn() },
  eventTemplateAsset: { update: vi.fn() },
  eventTemplateService: { update: vi.fn() },
}));
vi.mock("../src/utils/prisma", () => ({ prisma: db }));

const notify = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("../src/modules/notifications/user-notification.service", () => ({
  default: { create: notify },
}));

const templates = vi.hoisted(() => ({
  attachVenue: vi.fn(async () => ({ id: "line-v" })),
  attachAsset: vi.fn(async () => ({ id: "line-a" })),
  attachService: vi.fn(async () => ({ id: "line-s" })),
}));
vi.mock("../src/modules/event-template/event-template.service", () => ({
  default: templates,
}));

const cache = vi.hoisted(() => ({ invalidateAll: vi.fn(async () => {}) }));
vi.mock("../src/utils/cache-namespaces", async (orig) => ({
  ...(await orig<object>()),
  eventTemplateCache: cache,
}));

const {
  default: Svc,
  spotKey,
  takenSpots,
  linesOf,
} = await import("../src/modules/package-application/package-application.service");

const price = (n: number) => ({ toNumber: () => n });

/** A package being built by EF, with a venue waiting and gear accepted. */
function pkg(over: Record<string, unknown> = {}) {
  return {
    id: "tpl-1",
    name: "Garden Wedding Package",
    ownerId: EF,
    status: "draft",
    owner: { id: EF, name: "Ivan" },
    templateVenues: [
      {
        venueId: "v-1",
        matchRequestStatus: "pending",
        isOptional: false,
        venue: { name: "Sky Hall" },
      },
    ],
    templateAssets: [
      {
        assetId: "a-1",
        matchRequestStatus: "accepted",
        isOptional: false,
        asset: { name: "Monitors", category: "sound_system" },
      },
    ],
    templateServices: [
      {
        serviceId: "s-old",
        matchRequestStatus: "declined",
        isOptional: false,
        service: { name: "Pedro Photo", category: "photography" },
      },
    ],
    ...over,
  };
}

const photoService = (over: Record<string, unknown> = {}) => ({
  name: "Lens Studio",
  ownerId: PRO,
  status: "available",
  category: "photography",
  price: price(18000),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.eventTemplate.findUnique.mockResolvedValue(pkg());
  db.service.findUnique.mockResolvedValue(photoService());
  db.packageApplication.findFirst.mockResolvedValue(null);
  db.packageApplication.findMany.mockResolvedValue([]);
  db.packageApplication.updateMany.mockResolvedValue({ count: 1 });
});

describe("spots", () => {
  it("one venue per package; one per category for gear and services", () => {
    expect(spotKey("venue")).toBe("venue");
    expect(spotKey("service", "photography")).toBe("service:photography");
    expect(spotKey("asset", "sound_system")).toBe("asset:sound_system");
  });

  it("a waiting or accepted line takes its spot; a declined one frees it", () => {
    const taken = takenSpots(linesOf(pkg() as never));
    expect([...taken].sort()).toEqual(["asset:sound_system", "venue"]);
  });
});

describe("listing open packages", () => {
  it("lists only packages being built, never the caller's own", async () => {
    db.eventTemplate.findMany.mockResolvedValue([pkg()]);
    db.eventTemplate.count.mockResolvedValue(1);

    const out = await Svc.listOpen(PRO, { city: "Cebu" });

    expect(db.eventTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "draft",
          ownerId: { not: PRO },
          targetCity: { contains: "Cebu", mode: "insensitive" },
        }),
      }),
    );
    expect(out.packages[0].takenSpots.sort()).toEqual([
      "asset:sound_system",
      "venue",
    ]);
  });
});

describe("an open package's detail", () => {
  it("lists the caller's live listings and which can apply", async () => {
    db.venue.findMany.mockResolvedValue([
      { id: "v-2", name: "Old Barn", price: price(20000) },
    ] as never);
    db.service.findMany.mockResolvedValue([
      {
        id: "s-1",
        name: "Lens Studio",
        category: "photography",
        price: price(18000),
      },
      {
        id: "s-2",
        name: "Feast Co.",
        category: "catering",
        price: price(30000),
      },
    ] as never);
    db.packageApplication.findMany.mockResolvedValue([
      { id: "app-0", kind: "service", listingId: "s-2", status: "pending" },
    ] as never);

    const out = await Svc.getOpen(PRO, "tpl-1");

    const by = Object.fromEntries(out.myListings.map((l) => [l.id, l]));
    expect(by["v-2"]).toMatchObject({ canApply: false, why: "spot_taken" });
    expect(by["s-1"]).toMatchObject({
      canApply: true,
      why: null,
      price: 18000,
    });
    expect(by["s-2"]).toMatchObject({
      canApply: false,
      why: "already_applied",
    });
    // The declined photographer's line isn't shown, and doesn't take the spot.
    expect(out.lines.map((l) => l.listingId)).toEqual(["v-1", "a-1"]);
  });
});

describe("applying", () => {
  const apply = (over: Record<string, unknown> = {}) =>
    Svc.apply(PRO, "tpl-1", {
      kind: "service",
      listingId: "s-1",
      message: "  Two shooters  ",
      ...over,
    } as never);

  it("applies for an open spot and tells the Event Foxer", async () => {
    await apply();

    expect(db.packageApplication.create).toHaveBeenCalledWith({
      data: {
        templateId: "tpl-1",
        applicantId: PRO,
        kind: "service",
        listingId: "s-1",
        message: "Two shooters",
      },
    });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: EF, type: "PACKAGE_APPLICATION" }),
    );
  });

  it("refuses a spot already taken: a second venue", async () => {
    db.venue.findUnique.mockResolvedValue({
      name: "Old Barn",
      mayorId: PRO,
      status: "available",
      price: price(20000),
    });

    await expect(
      apply({ kind: "venue", listingId: "v-2" }),
    ).rejects.toMatchObject({ status: 409 });
    expect(db.packageApplication.create).not.toHaveBeenCalled();
  });

  it("refuses a category already taken: more sound gear", async () => {
    db.asset.findUnique.mockResolvedValue({
      name: "PA",
      ownerId: PRO,
      status: "available",
      category: "sound_system",
      price: price(5000),
    });

    await expect(
      apply({ kind: "asset", listingId: "a-2" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("refuses a second waiting application with the same listing", async () => {
    db.packageApplication.findFirst.mockResolvedValue({ id: "app-0" });

    await expect(apply()).rejects.toMatchObject({ status: 409 });
  });

  it("only with the applicant's own, live listing", async () => {
    db.service.findUnique.mockResolvedValue(
      photoService({ ownerId: "someone" }),
    );
    await expect(apply()).rejects.toMatchObject({ status: 403 });

    db.service.findUnique.mockResolvedValue(photoService({ status: "draft" }));
    await expect(apply()).rejects.toMatchObject({ status: 400 });
  });

  it("only to someone else's package that is still being built", async () => {
    db.eventTemplate.findUnique.mockResolvedValue(pkg({ status: "published" }));
    await expect(apply()).rejects.toMatchObject({ status: 404 });

    db.eventTemplate.findUnique.mockResolvedValue(pkg({ ownerId: PRO }));
    await expect(apply()).rejects.toMatchObject({ status: 400 });
  });
});

describe("answering an application", () => {
  const waiting = {
    id: "app-1",
    templateId: "tpl-1",
    applicantId: PRO,
    kind: "service",
    listingId: "s-1",
    status: "pending",
  };

  beforeEach(() => {
    db.packageApplication.findFirst.mockResolvedValue(waiting);
  });

  it("declining needs a reason, and Other needs a note", async () => {
    await expect(
      Svc.answer(EF, "tpl-1", "app-1", { status: "declined" }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      Svc.answer(EF, "tpl-1", "app-1", {
        status: "declined",
        reason: "other",
      } as never),
    ).rejects.toMatchObject({ status: 400 });

    await Svc.answer(EF, "tpl-1", "app-1", {
      status: "declined",
      reason: "price_too_low",
    } as never);
    expect(db.packageApplication.updateMany).toHaveBeenCalledWith({
      where: { id: "app-1", status: "pending" },
      data: expect.objectContaining({
        status: "declined",
        declineReason: "price_too_low",
      }),
    });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: PRO,
        type: "PACKAGE_APPLICATION_ANSWERED",
      }),
    );
  });

  it("accepting adds the listing as an accepted line and closes the others for that spot", async () => {
    db.packageApplication.findMany.mockResolvedValue([
      { id: "app-2", applicantId: "pro-2", kind: "service", listingId: "s-2" },
      { id: "app-3", applicantId: "pro-3", kind: "service", listingId: "s-3" },
    ] as never);
    db.service.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) =>
        where.id === "s-3"
          ? photoService({ ownerId: "pro-3", category: "catering" })
          : photoService({ ownerId: where.id === "s-2" ? "pro-2" : PRO }),
    );

    await Svc.answer(EF, "tpl-1", "app-1", { status: "accepted" });

    expect(templates.attachService).toHaveBeenCalledWith("tpl-1", EF, "s-1");
    expect(db.eventTemplateService.update).toHaveBeenCalledWith({
      where: { id: "line-s" },
      data: expect.objectContaining({
        matched: true,
        matchRequestStatus: "accepted",
      }),
    });
    // app-2 wanted the same photography spot; app-3 (catering) stays waiting.
    const closed = db.packageApplication.updateMany.mock.calls.map(
      (c) => (c[0] as { where: { id: string } }).where.id,
    );
    expect(closed).toContain("app-2");
    expect(closed).not.toContain("app-3");
  });

  it("won't accept into a spot that has been filled since", async () => {
    db.eventTemplate.findUnique.mockResolvedValue(
      pkg({
        templateServices: [
          {
            serviceId: "s-9",
            matchRequestStatus: "pending",
            isOptional: false,
            service: { name: "Golden Hour", category: "photography" },
          },
        ],
      }),
    );

    await expect(
      Svc.answer(EF, "tpl-1", "app-1", { status: "accepted" }),
    ).rejects.toMatchObject({ status: 409 });
    expect(templates.attachService).not.toHaveBeenCalled();
  });

  it("is the package's Event Foxer's alone, and only once", async () => {
    await expect(
      Svc.answer("someone", "tpl-1", "app-1", { status: "accepted" }),
    ).rejects.toMatchObject({ status: 403 });

    db.packageApplication.findFirst.mockResolvedValue({
      ...waiting,
      status: "declined",
    });
    await expect(
      Svc.answer(EF, "tpl-1", "app-1", { status: "accepted" }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("withdrawing", () => {
  it("takes back a waiting application of the applicant's own", async () => {
    await Svc.withdraw(PRO, "tpl-1", "app-1");
    expect(db.packageApplication.updateMany).toHaveBeenCalledWith({
      where: {
        id: "app-1",
        templateId: "tpl-1",
        applicantId: PRO,
        status: "pending",
      },
      data: expect.objectContaining({ status: "withdrawn" }),
    });

    db.packageApplication.updateMany.mockResolvedValue({ count: 0 });
    await expect(Svc.withdraw(PRO, "tpl-1", "app-x")).rejects.toMatchObject({
      status: 404,
    });
  });
});
