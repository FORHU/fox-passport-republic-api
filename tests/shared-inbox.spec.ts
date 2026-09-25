import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Shared Inbox (CONTEXT.md; ADR 0005). A thread belongs to a Venue or an
 * Event, not to whoever replied: its guest and whoever runs that Venue or
 * Event right now can read and answer it, a team change moves the inbox with
 * it, and each message keeps its real sender.
 */

const access = vi.hoisted(() => ({
  staffIds: vi.fn(),
  canOnVenue: vi.fn(),
  canOnEvent: vi.fn(),
}));
vi.mock("../src/modules/appointment/appointment.access", () => ({
  default: {
    ...access,
    venueScope: vi.fn(() => ({})),
    eventScope: vi.fn(() => ({})),
  },
}));

const repo = vi.hoisted(() => ({
  findById: vi.fn(),
  findInbox: vi.fn(),
  createInbox: vi.fn(),
  findByIdWithListShape: vi.fn(),
  findMessages: vi.fn(),
  createMessage: vi.fn(),
  touchLastMessage: vi.fn(),
  hideForUser: vi.fn(),
  findEventSuppliers: vi.fn(),
}));
vi.mock("../src/modules/conversations/conversation.repository", () => ({
  default: repo,
}));

vi.mock("../src/utils/prisma", () => ({
  prisma: {
    venue: { findUnique: vi.fn() },
    event: { findUnique: vi.fn() },
    booking: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

const emitToUser = vi.hoisted(() => vi.fn());
vi.mock("../src/infrastructure/socket/socket.utils", () => ({ emitToUser }));
vi.mock("../src/infrastructure/socket/socket.server", () => ({ io: {} }));
vi.mock("../src/modules/notifications/message-notification", () => ({
  notifyMessageRequest: vi.fn(),
  notifyMessageRequestAccepted: vi.fn(),
  notifyGroupMention: vi.fn(),
}));
vi.mock("../src/modules/block/block.repository", () => ({ default: {} }));

import { prisma } from "../src/utils/prisma";
import ConversationService from "../src/modules/conversations/conversation.service";

const p = prisma as unknown as {
  venue: { findUnique: ReturnType<typeof vi.fn> };
  event: { findUnique: ReturnType<typeof vi.fn> };
  booking: { findFirst: ReturnType<typeof vi.fn> };
};

// Sky Hall's inbox: Rosa (a guest) wrote in; Maria is the Mayor and Ben one
// of its Organizers.
const venueThread = {
  id: "c1",
  isGroup: false,
  userAId: null,
  userBId: null,
  participants: [],
  status: "accepted",
  initiatorId: "rosa",
  inboxVenueId: "v1",
  inboxEventId: null,
  guestId: "rosa",
};

const listShape = (overrides: Record<string, unknown> = {}) => ({
  ...venueThread,
  contextType: "venue_inbox",
  contextLabel: "Sky Hall",
  lastMessageAt: null,
  createdAt: new Date(),
  name: null,
  inboxVenue: { id: "v1", name: "Sky Hall" },
  inboxEvent: null,
  guest: { id: "rosa", name: "Rosa", imgId: null },
  messages: [],
  settings: [],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  repo.findById.mockResolvedValue(venueThread);
  access.staffIds.mockResolvedValue(["maria", "ben"]);
  repo.findMessages.mockResolvedValue([]);
  repo.findEventSuppliers.mockResolvedValue([]);
  repo.findInbox.mockResolvedValue(null);
});

describe("who can read and answer a Shared Inbox thread", () => {
  it.each(["rosa", "maria", "ben"])("lets %s in", async (userId) => {
    await expect(
      ConversationService.getMessages("c1", userId),
    ).resolves.toEqual([]);
  });

  it("keeps a stranger out", async () => {
    await expect(
      ConversationService.getMessages("c1", "stranger"),
    ).rejects.toThrow("Unauthorized");
  });

  it("follows the team: someone who left is out at once", async () => {
    access.staffIds.mockResolvedValue(["maria"]);
    await expect(ConversationService.getMessages("c1", "ben")).rejects.toThrow(
      "Unauthorized",
    );
  });

  it("asks for the permission that answers a Venue's inbox", async () => {
    await ConversationService.getMessages("c1", "maria");
    expect(access.staffIds).toHaveBeenCalledWith(
      { venueId: "v1" },
      "venue:reply",
    );
  });
});

describe("sending into a Shared Inbox thread", () => {
  it("reaches the guest and the whole current team, under the real sender", async () => {
    repo.createMessage.mockResolvedValue({ id: "m1", senderId: "ben" });
    await ConversationService.sendMessage({
      conversationId: "c1",
      senderId: "ben",
      content: "Yes, there's parking.",
    });
    expect(repo.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({ senderId: "ben" }),
    );
    const reached = emitToUser.mock.calls.map(([, id]) => id).sort();
    expect(reached).toEqual(["ben", "maria", "rosa"]);
  });

  it("cannot be deleted like a private chat", async () => {
    await expect(
      ConversationService.deleteChatForUser("c1", "rosa"),
    ).rejects.toThrow(/can't be deleted/);
    expect(repo.hideForUser).not.toHaveBeenCalled();
  });
});

describe("how the thread reads to each side", () => {
  it("shows the guest the Venue, not a person", async () => {
    repo.findInbox.mockResolvedValue(venueThread);
    repo.findByIdWithListShape.mockResolvedValue(listShape());
    p.venue.findUnique.mockResolvedValue({
      id: "v1",
      name: "Sky Hall",
      status: "available",
    });
    access.canOnVenue.mockResolvedValue(false);

    const result = await ConversationService.startInboxConversation("rosa", {
      venueId: "v1",
    });
    expect(result).toMatchObject({
      isInbox: true,
      viewerRole: "guest",
      inbox: { type: "venue", id: "v1", name: "Sky Hall" },
      otherUser: null,
    });
  });
});

describe("starting a Shared Inbox thread", () => {
  beforeEach(() => {
    repo.findByIdWithListShape.mockResolvedValue(listShape());
    repo.createInbox.mockResolvedValue(venueThread);
  });

  it("reopens the existing thread instead of starting a second", async () => {
    p.venue.findUnique.mockResolvedValue({
      id: "v1",
      name: "Sky Hall",
      status: "available",
    });
    access.canOnVenue.mockResolvedValue(false);
    repo.findInbox.mockResolvedValue(venueThread);

    await ConversationService.startInboxConversation("rosa", { venueId: "v1" });
    expect(repo.createInbox).not.toHaveBeenCalled();
  });

  it("will not let a Venue's own team write to it as a guest", async () => {
    p.venue.findUnique.mockResolvedValue({
      id: "v1",
      name: "Sky Hall",
      status: "available",
    });
    access.canOnVenue.mockResolvedValue(true);
    await expect(
      ConversationService.startInboxConversation("ben", { venueId: "v1" }),
    ).rejects.toThrow(/you answer it/);
  });

  it("only opens an Event's inbox to someone with a booking", async () => {
    p.event.findUnique.mockResolvedValue({ id: "ev1", name: "Jazz Night" });
    access.canOnEvent.mockResolvedValue(false);
    p.booking.findFirst.mockResolvedValue(null);
    await expect(
      ConversationService.startInboxConversation("sam", { eventId: "ev1" }),
    ).rejects.toThrow(/Only guests with a booking/);
  });

  it("lets an Event's team write first, to an attendee", async () => {
    p.event.findUnique.mockResolvedValue({ id: "ev1", name: "Jazz Night" });
    access.canOnEvent.mockResolvedValue(true);
    p.booking.findFirst.mockResolvedValue({ id: "b1" });
    repo.findInbox.mockResolvedValue(null);

    await ConversationService.startInboxConversation("ben", {
      eventId: "ev1",
      guestId: "rosa",
    });
    expect(repo.createInbox).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { eventId: "ev1" },
        guestId: "rosa",
        initiatorId: "ben",
      }),
    );
  });

  it("will not let an outsider write first on an Event's behalf", async () => {
    p.event.findUnique.mockResolvedValue({ id: "ev1", name: "Jazz Night" });
    access.canOnEvent.mockResolvedValue(false);
    await expect(
      ConversationService.startInboxConversation("stranger", {
        eventId: "ev1",
        guestId: "rosa",
      }),
    ).rejects.toThrow("Unauthorized");
  });

  it("will not let a Venue's team start threads with people", async () => {
    await expect(
      ConversationService.startInboxConversation("maria", {
        venueId: "v1",
        guestId: "rosa",
      }),
    ).rejects.toThrow(/doesn't start them/);
  });
});

// Decided 25 Sep: an Event's team talks to its Suppliers through the same
// inbox, under `event:message-suppliers` (ADR 0005).
describe("an Event's inbox with its Suppliers", () => {
  const gino = { id: "gino", name: "Gino", imgId: null };
  const asSupplier = (userId: string) => [
    { user: { ...gino, id: userId }, supplies: [{ kind: "service", name: "DJ set", via: "booked" }] },
  ];
  const canOnEventWith = (...granted: string[]) =>
    access.canOnEvent.mockImplementation(
      async (_eventId: string, _userId: string, permission: string) =>
        granted.includes(permission),
    );

  beforeEach(() => {
    p.event.findUnique.mockResolvedValue({ id: "ev1", name: "Jazz Night" });
    p.booking.findFirst.mockResolvedValue(null);
    repo.findByIdWithListShape.mockResolvedValue(listShape());
    repo.createInbox.mockResolvedValue({ id: "c2" });
  });

  it("lets the team write first to a Supplier, as a supplier thread", async () => {
    canOnEventWith("event:message-attendees", "event:message-suppliers");
    repo.findEventSuppliers.mockResolvedValue(asSupplier("gino"));

    await ConversationService.startInboxConversation("ben", {
      eventId: "ev1",
      guestId: "gino",
    });
    expect(repo.createInbox).toHaveBeenCalledWith(
      expect.objectContaining({ guestId: "gino", inboxWith: "supplier" }),
    );
  });

  it("lets a Supplier write to the Event first", async () => {
    canOnEventWith();
    repo.findEventSuppliers.mockResolvedValue(asSupplier("gino"));

    await ConversationService.startInboxConversation("gino", { eventId: "ev1" });
    expect(repo.createInbox).toHaveBeenCalledWith(
      expect.objectContaining({ guestId: "gino", inboxWith: "supplier" }),
    );
  });

  it("files someone who is both a guest and a Supplier as a guest", async () => {
    canOnEventWith("event:message-attendees", "event:message-suppliers");
    p.booking.findFirst.mockResolvedValue({ id: "b1" });
    repo.findEventSuppliers.mockResolvedValue(asSupplier("gino"));

    await ConversationService.startInboxConversation("ben", {
      eventId: "ev1",
      guestId: "gino",
    });
    expect(repo.createInbox).toHaveBeenCalledWith(
      expect.objectContaining({ inboxWith: "guest" }),
    );
  });

  it("needs the supplier permission to write to a Supplier", async () => {
    canOnEventWith("event:message-attendees");
    repo.findEventSuppliers.mockResolvedValue(asSupplier("gino"));

    await expect(
      ConversationService.startInboxConversation("helper", {
        eventId: "ev1",
        guestId: "gino",
      }),
    ).rejects.toThrow("Unauthorized");
  });

  it("refuses someone the Event neither booked nor hosts", async () => {
    canOnEventWith("event:message-attendees", "event:message-suppliers");
    await expect(
      ConversationService.startInboxConversation("ben", {
        eventId: "ev1",
        guestId: "stranger",
      }),
    ).rejects.toThrow(/doesn't supply it/);
  });

  it("reads a supplier thread with the supplier permission", async () => {
    repo.findById.mockResolvedValue({
      ...venueThread,
      inboxVenueId: null,
      inboxEventId: "ev1",
      guestId: "gino",
      inboxWith: "supplier",
    });
    await ConversationService.getMessages("c1", "maria");
    expect(access.staffIds).toHaveBeenCalledWith(
      { eventId: "ev1" },
      "event:message-suppliers",
    );
  });

  it("lists Suppliers only for those who may message them, without the caller", async () => {
    canOnEventWith("event:message-suppliers");
    repo.findEventSuppliers.mockResolvedValue([
      ...asSupplier("gino"),
      ...asSupplier("juan"),
    ]);
    const rows = await ConversationService.listEventSuppliers("juan", "ev1");
    expect(rows.map((r) => r.user.id)).toEqual(["gino"]);

    canOnEventWith();
    await expect(
      ConversationService.listEventSuppliers("stranger", "ev1"),
    ).rejects.toThrow("Unauthorized");
  });
});
