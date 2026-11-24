import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * api#447: a Provider accepts or declines a package invite (a matched
 * template line). A decline names a reason the Event Foxer sees, `other`
 * needs a note, an invite is answered once, and answering clears the cached
 * invite lists. Re-inviting (a new Provider, or after a decline) starts the
 * line afresh. Prisma and the cache are stubbed; the service is real.
 */

const db = vi.hoisted(() => {
  const table = () => ({
    findUnique: vi.fn(),
    updateMany: vi.fn(async () => ({ count: 1 })),
    update: vi.fn(async (args: { data: object }) => args.data),
  });
  return {
    eventTemplateAsset: table(),
    eventTemplateService: table(),
    eventTemplateVenue: table(),
    eventTemplate: { findUnique: vi.fn() },
  };
});
vi.mock("../src/utils/prisma", () => ({ prisma: db }));

const cache = vi.hoisted(() => ({
  cached: vi.fn((_k: string, _t: number, load: () => unknown) => load()),
  invalidateAll: vi.fn(async () => {}),
}));
vi.mock("../src/utils/cache-namespaces", async (orig) => ({
  ...(await orig<object>()),
  eventTemplateCache: cache,
}));

const { default: EventTemplateSvc } =
  await import("../src/modules/event-template/event-template.service");

const OWNER = "provider-1";

function pendingService(over: Record<string, unknown> = {}) {
  return {
    id: "line-1",
    matched: true,
    matchRequestStatus: "pending",
    serviceId: "svc-1",
    service: { ownerId: OWNER },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.eventTemplateService.findUnique.mockResolvedValue(pendingService());
  db.eventTemplateService.updateMany.mockResolvedValue({ count: 1 });
});

const respond = (over: Record<string, unknown> = {}) =>
  EventTemplateSvc.respondToMatch({
    matchId: "line-1",
    type: "service",
    responderId: OWNER,
    status: "declined",
    reason: "unavailable_on_date",
    ...over,
  } as Parameters<typeof EventTemplateSvc.respondToMatch>[0]);

describe("respondToMatch", () => {
  it("stores a decline with its reason and note, and clears the cached lists", async () => {
    const result = await respond({ note: "  Booked at another wedding " });

    expect(db.eventTemplateService.updateMany).toHaveBeenCalledWith({
      where: { id: "line-1", matchRequestStatus: "pending" },
      data: expect.objectContaining({
        matchRequestStatus: "declined",
        declineReason: "unavailable_on_date",
        declineNote: "Booked at another wedding",
        respondedAt: expect.any(Date),
      }),
    });
    expect(result).toMatchObject({ declineReason: "unavailable_on_date" });
    expect(cache.invalidateAll).toHaveBeenCalledTimes(1);
  });

  it("refuses a decline without a reason", async () => {
    await expect(respond({ reason: undefined })).rejects.toMatchObject({
      status: 400,
    });
    expect(db.eventTemplateService.updateMany).not.toHaveBeenCalled();
  });

  it("needs a note when the reason is Other", async () => {
    await expect(
      respond({ reason: "other", note: "  " }),
    ).rejects.toMatchObject({ status: 400 });
    await respond({ reason: "other", note: "Moving away" });
    expect(db.eventTemplateService.updateMany).toHaveBeenCalledTimes(1);
  });

  it("accepts without a reason and keeps none", async () => {
    await respond({ status: "accepted", reason: "too_far", note: "x" });

    expect(db.eventTemplateService.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          matchRequestStatus: "accepted",
          declineReason: null,
          declineNote: null,
        }),
      }),
    );
  });

  it("answers an invite once", async () => {
    db.eventTemplateService.findUnique.mockResolvedValue(
      pendingService({ matchRequestStatus: "accepted" }),
    );
    await expect(respond()).rejects.toMatchObject({ status: 409 });
    expect(db.eventTemplateService.updateMany).not.toHaveBeenCalled();
  });

  it("loses cleanly to an answer that landed first", async () => {
    db.eventTemplateService.updateMany.mockResolvedValue({ count: 0 });
    await expect(respond()).rejects.toMatchObject({ status: 409 });
    expect(cache.invalidateAll).not.toHaveBeenCalled();
  });

  it("is only for the invited item's owner", async () => {
    await expect(
      respond({ responderId: "someone-else" }),
    ).rejects.toMatchObject({ status: 404 });
    db.eventTemplateService.findUnique.mockResolvedValue(null);
    await expect(respond()).rejects.toMatchObject({ status: 404 });
    expect(db.eventTemplateService.updateMany).not.toHaveBeenCalled();
  });

  it("checks venues against their mayor and assets against their owner", async () => {
    db.eventTemplateVenue.findUnique.mockResolvedValue({
      id: "line-1",
      matched: true,
      matchRequestStatus: "pending",
      venue: { mayorId: OWNER },
    });
    await respond({ type: "venue" });
    expect(db.eventTemplateVenue.updateMany).toHaveBeenCalledTimes(1);

    db.eventTemplateAsset.findUnique.mockResolvedValue({
      id: "line-1",
      matched: true,
      matchRequestStatus: "pending",
      asset: { ownerId: "not-me" },
    });
    await expect(respond({ type: "asset" })).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("matchItem: re-inviting starts afresh", () => {
  const TEMPLATE = {
    id: "tpl-1",
    ownerId: "ef-1",
    targetState: "Cebu",
    targetCountry: "PH",
  };
  const services = db as unknown as {
    service: { findUnique: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    db.eventTemplate.findUnique.mockResolvedValue(TEMPLATE);
    services.service = {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        state: "Cebu",
        country: "PH",
      })),
    };
  });

  const match = (providerId: string) =>
    EventTemplateSvc.matchItem({
      templateId: "tpl-1",
      ownerId: "ef-1",
      itemId: "line-1",
      type: "service",
      providerId,
      description: "Photos",
      matchedAt: new Date(),
    });

  const savedData = () =>
    (
      db.eventTemplateService.update.mock.calls.at(-1)?.[0] as {
        data: Record<string, unknown>;
      }
    ).data;

  const reset = {
    matchRequestStatus: "pending",
    declineReason: null,
    declineNote: null,
    respondedAt: null,
  };

  it("resets the answer when the line goes to another Provider", async () => {
    db.eventTemplateService.findUnique.mockResolvedValue(
      pendingService({ matchRequestStatus: "declined", serviceId: "svc-1" }),
    );
    await match("svc-2");
    expect(savedData()).toMatchObject({ serviceId: "svc-2", ...reset });
  });

  it("resets a declined invite asked again of the same Provider", async () => {
    db.eventTemplateService.findUnique.mockResolvedValue(
      pendingService({
        matchRequestStatus: "declined",
        declineReason: "price_too_low",
      }),
    );
    await match("svc-1");
    expect(savedData()).toMatchObject(reset);
  });

  it("keeps an accepted invite when only the details change", async () => {
    db.eventTemplateService.findUnique.mockResolvedValue(
      pendingService({ matchRequestStatus: "accepted" }),
    );
    await match("svc-1");
    expect(savedData()).not.toHaveProperty("matchRequestStatus");
  });
});
