import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * api#461 and api#462: a package goes for review only once its required
 * Suppliers accepted; a Supplier can leave a package (a live one missing a
 * required Supplier is open again); an expired request can't be answered;
 * requests expire after 3 days with a reminder after 2; the Event Foxer hears
 * about every answer. Prisma, the repository's submit and notifications are
 * stubbed; the services are real.
 */

const EF = "ef-1";
const PRO = "pro-1";

const line = () => ({
  findUnique: vi.fn(),
  findMany: vi.fn(async () => []),
  updateMany: vi.fn(async () => ({ count: 1 })),
});
const db = vi.hoisted(() => ({
  eventTemplate: {
    findUnique: vi.fn(),
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
  eventTemplateAsset: {} as Record<string, ReturnType<typeof vi.fn>>,
  eventTemplateService: {} as Record<string, ReturnType<typeof vi.fn>>,
  eventTemplateVenue: {} as Record<string, ReturnType<typeof vi.fn>>,
}));
vi.mock("../src/utils/prisma", () => ({ prisma: db }));

const notify = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("../src/modules/notifications/user-notification.service", () => ({
  default: { create: notify },
}));

const repo = vi.hoisted(() => ({
  submitTemplate: vi.fn(async () => ({ id: "tpl-1", status: "pending" })),
}));
vi.mock("../src/modules/event-template/event-template.repository", () => ({
  default: repo,
}));

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
const { default: Sweep } =
  await import("../src/modules/event-template/package-request-sweep.service");

beforeEach(() => {
  vi.clearAllMocks();
  db.eventTemplateAsset = line();
  db.eventTemplateService = line();
  db.eventTemplateVenue = line();
  db.eventTemplate.findUnique.mockResolvedValue({
    ownerId: EF,
    name: "Garden Wedding Package",
  });
  db.eventTemplate.updateMany.mockResolvedValue({ count: 1 });
});

describe("sending a package for review", () => {
  const withLines = (
    services: { status: string; isOptional?: boolean; name: string }[],
  ) =>
    db.eventTemplate.findUnique.mockResolvedValue({
      ownerId: EF,
      templateVenues: [
        {
          isOptional: false,
          venueId: "v-1",
          matchRequestStatus: "accepted",
          venue: { name: "Sky Hall", status: "available" },
        },
      ],
      templateAssets: [],
      templateServices: services.map((s, i) => ({
        serviceId: `s-${i}`,
        isOptional: s.isOptional ?? false,
        matchRequestStatus: s.status,
        service: { name: s.name },
      })),
    });

  it("waits for every required Supplier, naming who", async () => {
    withLines([
      { status: "accepted", name: "Lens Studio" },
      { status: "pending", name: "Feast Co." },
      { status: "expired", name: "DJ Kai" },
    ]);

    await expect(
      EventTemplateSvc.submitTemplate("tpl-1", EF),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("Feast Co., DJ Kai"),
    });
    expect(repo.submitTemplate).not.toHaveBeenCalled();
  });

  it("goes once the required ones accepted; optional ones don't hold it up", async () => {
    withLines([
      { status: "accepted", name: "Lens Studio" },
      { status: "pending", isOptional: true, name: "Garden Lights" },
    ]);

    await EventTemplateSvc.submitTemplate("tpl-1", EF);
    expect(repo.submitTemplate).toHaveBeenCalledWith("tpl-1", EF);
  });
});

describe("a Supplier leaving a package", () => {
  const joined = (over: Record<string, unknown> = {}) => ({
    id: "line-1",
    templateId: "tpl-1",
    matched: true,
    matchRequestStatus: "accepted",
    isOptional: false,
    service: { ownerId: PRO },
    ...over,
  });
  const leave = (over: Record<string, unknown> = {}) =>
    EventTemplateSvc.leaveMatch({
      matchId: "line-1",
      type: "service",
      supplierId: PRO,
      reason: "no_capacity",
      ...over,
    } as never);

  it("declines the line with the reason, reopens a live package, and tells the Event Foxer", async () => {
    db.eventTemplateService.findUnique.mockResolvedValue(joined());

    const out = await leave();

    expect(db.eventTemplateService.updateMany).toHaveBeenCalledWith({
      where: { id: "line-1", matchRequestStatus: "accepted" },
      data: expect.objectContaining({
        matchRequestStatus: "declined",
        declineReason: "no_capacity",
      }),
    });
    expect(db.eventTemplate.updateMany).toHaveBeenCalledWith({
      where: { id: "tpl-1", status: "published" },
      data: { status: "draft", isPublic: false },
    });
    expect(out.reopened).toBe(true);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: EF, type: "PACKAGE_ANSWER" }),
    );
  });

  it("an optional line leaving doesn't reopen the package", async () => {
    db.eventTemplateService.findUnique.mockResolvedValue(
      joined({ isOptional: true }),
    );

    const out = await leave();

    expect(db.eventTemplate.updateMany).not.toHaveBeenCalled();
    expect(out.reopened).toBe(false);
  });

  it("only from a package they joined", async () => {
    db.eventTemplateService.findUnique.mockResolvedValue(
      joined({ matchRequestStatus: "pending" }),
    );
    await expect(leave()).rejects.toMatchObject({ status: 409 });

    db.eventTemplateService.findUnique.mockResolvedValue(
      joined({ service: { ownerId: "someone" } }),
    );
    await expect(leave()).rejects.toMatchObject({ status: 404 });
  });
});

describe("answering a request", () => {
  it("an expired request can't be answered", async () => {
    db.eventTemplateService.findUnique.mockResolvedValue({
      id: "line-1",
      templateId: "tpl-1",
      matched: true,
      matchRequestStatus: "expired",
      service: { ownerId: PRO },
    });

    await expect(
      EventTemplateSvc.respondToMatch({
        matchId: "line-1",
        type: "service",
        responderId: PRO,
        status: "accepted",
      } as never),
    ).rejects.toMatchObject({
      status: 409,
      message: "This invite has expired",
    });
  });

  it("the Event Foxer hears about a decline, with the reason", async () => {
    db.eventTemplateService.findUnique.mockResolvedValue({
      id: "line-1",
      templateId: "tpl-1",
      matched: true,
      matchRequestStatus: "pending",
      service: { ownerId: PRO },
    });

    await EventTemplateSvc.respondToMatch({
      matchId: "line-1",
      type: "service",
      responderId: PRO,
      status: "declined",
      reason: "too_far",
    } as never);

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: EF,
        title: "A Supplier declined",
        message: expect.stringContaining("too_far"),
      }),
    );
  });
});

describe("the request sweep", () => {
  const now = new Date("2026-12-10T12:00:00Z");
  const waiting = (id: string) => ({
    id,
    templateId: "tpl-1",
    template: { name: "Garden Wedding Package" },
    service: { name: "Lens Studio", ownerId: PRO },
  });

  it("expires requests older than 3 days and reminds after 2", async () => {
    db.eventTemplateService.findMany.mockImplementation(
      async ({ where }: { where: { remindedAt?: null } }) =>
        "remindedAt" in where ? [waiting("line-2")] : [waiting("line-1")],
    );

    const out = await Sweep.run(now);

    expect(out).toEqual({ expired: 1, reminded: 1 });
    const updates = db.eventTemplateService.updateMany.mock.calls.map(
      (c) => c[0] as { where: { id: string }; data: Record<string, unknown> },
    );
    expect(updates).toContainEqual({
      where: { id: "line-1", matchRequestStatus: "pending" },
      data: { matchRequestStatus: "expired" },
    });
    expect(updates).toContainEqual({
      where: { id: "line-2", matchRequestStatus: "pending" },
      data: { remindedAt: now },
    });
    const types = notify.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toEqual(
      expect.arrayContaining([
        "PACKAGE_INVITE_EXPIRED",
        "PACKAGE_ANSWER",
        "PACKAGE_INVITE_REMINDER",
      ]),
    );
    expect(cache.invalidateAll).toHaveBeenCalled();
  });

  it("asks for lines by when they were requested", async () => {
    await Sweep.run(now);

    const wheres = db.eventTemplateService.findMany.mock.calls.map(
      (c) => (c[0] as { where: { requestedAt: { lt: Date } } }).where,
    );
    expect(wheres[0].requestedAt.lt).toEqual(new Date("2026-12-07T12:00:00Z"));
    expect(wheres[1].requestedAt.lt).toEqual(new Date("2026-12-08T12:00:00Z"));
  });
});
