import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * An Event that ended with bookings and nobody checked in is flagged for a
 * person to review - never settled automatically: no status change, so no
 * completion XP, payouts or refunds. Every API instance runs the daily sweep,
 * so the flag is claimed first and only the winner tells the Event Foxer.
 */

const repo = vi.hoisted(() => ({
  findUnattendedPast: vi.fn(),
  claimReviewFlag: vi.fn(async () => true),
  advanceStatus: vi.fn(),
}));
vi.mock("../src/modules/event-request/event-request.repository", () => ({
  default: repo,
}));

const notifications = vi.hoisted(() => ({ create: vi.fn(async () => ({})) }));
vi.mock("../src/modules/notifications/user-notification.service", () => ({
  default: notifications,
}));

const socket = vi.hoisted(() => ({ announceAdminQueueChanged: vi.fn() }));
vi.mock("../src/infrastructure/socket/invalidate", () => socket);

import EventRequestSvc from "../src/modules/event-request/event-request.service";

const NOW = new Date("2026-10-28T01:00:00Z");
const EVENT = { id: "e1", name: "Fox Night", organizerId: "foxer" };

beforeEach(() => {
  vi.clearAllMocks();
  repo.findUnattendedPast.mockResolvedValue([EVENT]);
  repo.claimReviewFlag.mockResolvedValue(true);
});

describe("flagUnattendedPast", () => {
  it("flags the Event and tells its Event Foxer", async () => {
    expect(await EventRequestSvc.flagUnattendedPast(NOW)).toBe(1);

    expect(repo.claimReviewFlag).toHaveBeenCalledWith("e1", NOW);
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "foxer",
        type: "EVENT_NEEDS_REVIEW",
      }),
    );
    expect(socket.announceAdminQueueChanged).toHaveBeenCalledTimes(1);
  });

  it("never changes the Event's status", async () => {
    await EventRequestSvc.flagUnattendedPast(NOW);
    expect(repo.advanceStatus).not.toHaveBeenCalled();
  });

  it("tells nobody when another instance claimed the flag", async () => {
    repo.claimReviewFlag.mockResolvedValue(false);

    expect(await EventRequestSvc.flagUnattendedPast(NOW)).toBe(0);
    expect(notifications.create).not.toHaveBeenCalled();
    expect(socket.announceAdminQueueChanged).not.toHaveBeenCalled();
  });

  it("does nothing when no Event qualifies", async () => {
    repo.findUnattendedPast.mockResolvedValue([]);

    expect(await EventRequestSvc.flagUnattendedPast(NOW)).toBe(0);
    expect(repo.claimReviewFlag).not.toHaveBeenCalled();
    expect(socket.announceAdminQueueChanged).not.toHaveBeenCalled();
  });

  it("keeps flagging when one notification fails", async () => {
    repo.findUnattendedPast.mockResolvedValue([
      EVENT,
      { id: "e2", name: "Fox Day", organizerId: "foxer2" },
    ]);
    notifications.create.mockRejectedValueOnce(new Error("down"));

    expect(await EventRequestSvc.flagUnattendedPast(NOW)).toBe(2);
    expect(notifications.create).toHaveBeenCalledTimes(2);
  });
});
