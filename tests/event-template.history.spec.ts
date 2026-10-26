import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A package's History (GET /event-templates/:id/history): what changed on it,
 * who did it and when. Edits record only the fields that actually changed,
 * before and after. Reads are the owner's only, and name people without the
 * email the audit row keeps.
 */

const repo = vi.hoisted(() => ({
  findTemplateById: vi.fn(),
  updateTemplate: vi.fn(async () => ({
    templateAssets: [],
    templateServices: [],
    templateVenues: [],
  })),
  historyNames: vi.fn(),
  attachVenue: vi.fn(),
}));
vi.mock("../src/modules/event-template/event-template.repository", () => ({
  default: repo,
}));

const audit = vi.hoisted(() => ({
  recordChangeBy: vi.fn(async () => undefined),
  listAuditForTarget: vi.fn(),
}));
vi.mock("../src/modules/audit/audit.service", () => audit);

import EventTemplateSvc from "../src/modules/event-template/event-template.service";

const PACKAGE = {
  id: "t1",
  ownerId: "foxer",
  name: "Fiesta Birthday",
  description: "A party",
  maxAttendees: 100,
  hostMarkupPct: 10,
  isPublic: true,
  images: [{ id: "img1" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  repo.findTemplateById.mockResolvedValue(structuredClone(PACKAGE));
});

describe("updateTemplate records the History", () => {
  it("records only the fields that changed, before and after", async () => {
    await EventTemplateSvc.updateTemplate({
      id: "t1",
      ownerId: "foxer",
      data: { name: "Fiesta Birthday", maxAttendees: 120, hostMarkupPct: 12 },
    });
    expect(audit.recordChangeBy).toHaveBeenCalledWith(
      "foxer",
      "package.edit",
      "t1",
      {
        changes: {
          maxAttendees: { from: 100, to: 120 },
          hostMarkupPct: { from: 10, to: 12 },
        },
      },
    );
  });

  it("records removing the capacity as a change to null", async () => {
    await EventTemplateSvc.updateTemplate({
      id: "t1",
      ownerId: "foxer",
      data: { maxAttendees: null },
    });
    expect(audit.recordChangeBy).toHaveBeenCalledWith(
      "foxer",
      "package.edit",
      "t1",
      {
        changes: { maxAttendees: { from: 100, to: null } },
      },
    );
  });

  it("notes new photos as a count, not their ids", async () => {
    await EventTemplateSvc.updateTemplate({
      id: "t1",
      ownerId: "foxer",
      data: { imgIds: ["img1", "img2"] },
    });
    expect(audit.recordChangeBy).toHaveBeenCalledWith(
      "foxer",
      "package.edit",
      "t1",
      {
        changes: { photos: { from: 1, to: 2 } },
      },
    );
  });

  it("records nothing when a save changes nothing", async () => {
    await EventTemplateSvc.updateTemplate({
      id: "t1",
      ownerId: "foxer",
      data: { name: "Fiesta Birthday", imgIds: ["img1"] },
    });
    expect(audit.recordChangeBy).not.toHaveBeenCalled();
  });
});

describe("history", () => {
  it("is the owner's only", async () => {
    await expect(
      EventTemplateSvc.history("t1", "someone-else"),
    ).rejects.toMatchObject({
      status: 403,
    });
    expect(audit.listAuditForTarget).not.toHaveBeenCalled();
  });

  it("names who acted and which item, and never returns an email", async () => {
    audit.listAuditForTarget.mockResolvedValue([
      {
        id: "a2",
        createdAt: new Date("2027-06-02T10:00:00Z"),
        action: "booking.created",
        actorId: "guest",
        actorEmail: "guest@example.com",
        metadata: { bookingId: "b1", guestCount: 40 },
      },
      {
        id: "a1",
        createdAt: new Date("2027-06-01T10:00:00Z"),
        action: "package.item.add",
        actorId: "foxer",
        actorEmail: "foxer@example.com",
        metadata: { kind: "venue", itemId: "v1" },
      },
    ]);
    repo.historyNames.mockResolvedValue({
      users: new Map([
        ["guest", "Ana"],
        ["foxer", "Ivan"],
      ]),
      items: new Map([["v1", "Sky Hall"]]),
    });

    const entries = await EventTemplateSvc.history("t1", "foxer");

    expect(repo.historyNames).toHaveBeenCalledWith({
      userIds: ["guest", "foxer"],
      assetIds: [],
      serviceIds: [],
      venueIds: ["v1"],
    });
    expect(entries).toEqual([
      {
        id: "a2",
        at: new Date("2027-06-02T10:00:00Z"),
        action: "booking.created",
        actor: { id: "guest", name: "Ana" },
        bookingId: "b1",
        guestCount: 40,
      },
      {
        id: "a1",
        at: new Date("2027-06-01T10:00:00Z"),
        action: "package.item.add",
        actor: { id: "foxer", name: "Ivan" },
        kind: "venue",
        itemId: "v1",
        itemName: "Sky Hall",
      },
    ]);
    expect(JSON.stringify(entries)).not.toContain("@example.com");
  });
});

describe("attachVenue", () => {
  it("does not add a venue the package already has (Publish re-sends it)", async () => {
    repo.findTemplateById.mockResolvedValue({
      ...structuredClone(PACKAGE),
      templateVenues: [{ id: "tv1", venueId: "v1" }],
    });
    const result = await EventTemplateSvc.attachVenue("t1", "foxer", "v1");
    expect(result).toMatchObject({ id: "tv1", alreadyAttached: true });
    expect(repo.attachVenue).not.toHaveBeenCalled();
  });
});
