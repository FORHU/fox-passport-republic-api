import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `follow.service.ts` is where the actual follow/unfollow rules live: block
 * checks, self-follow rejection, and the public-vs-private accepted/pending
 * split. None of that was covered by a test before this file.
 */

const findRow = vi.fn();
const create = vi.fn();
const del = vi.fn();
const getUserBasic = vi.fn();
const isBlockedEitherWay = vi.fn();

vi.mock("../src/modules/follow/follow.repository", () => ({
  default: {
    findRow: (...args: unknown[]) => findRow(...args),
    create: (...args: unknown[]) => create(...args),
    delete: (...args: unknown[]) => del(...args),
    getUserBasic: (...args: unknown[]) => getUserBasic(...args),
  },
}));

vi.mock("../src/modules/block/block.repository", () => ({
  default: {
    isBlockedEitherWay: (...args: unknown[]) => isBlockedEitherWay(...args),
  },
}));

const notifyFollowRequest = vi.fn();
const notifyNewFollower = vi.fn();

vi.mock("../src/modules/notifications/follow-notification", () => ({
  notifyFollowRequest: (...args: unknown[]) => notifyFollowRequest(...args),
  notifyNewFollower: (...args: unknown[]) => notifyNewFollower(...args),
  notifyFollowAccepted: vi.fn(),
}));

import FollowService from "../src/modules/follow/follow.service";

beforeEach(() => {
  vi.clearAllMocks();
  findRow.mockResolvedValue(null);
  isBlockedEitherWay.mockResolvedValue(false);
  getUserBasic.mockImplementation(async (id: string) => ({
    id,
    name: "Someone",
    isPrivate: false,
  }));
});

describe("FollowService.sendFollow", () => {
  it("refuses to follow yourself", async () => {
    await expect(FollowService.sendFollow("u1", "u1")).rejects.toThrow(
      "You cannot follow yourself",
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses when either side has blocked the other", async () => {
    isBlockedEitherWay.mockResolvedValue(true);

    await expect(FollowService.sendFollow("u1", "u2")).rejects.toThrow(
      "You can't follow this citizen.",
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("creates an accepted follow and notifies for a public target", async () => {
    getUserBasic.mockImplementation(async (id: string) => ({
      id,
      name: "Target",
      isPrivate: false,
    }));

    const result = await FollowService.sendFollow("u1", "u2");

    expect(result).toEqual({ status: "accepted" });
    expect(create).toHaveBeenCalledWith("u1", "u2", "accepted");
    expect(notifyNewFollower).toHaveBeenCalled();
    expect(notifyFollowRequest).not.toHaveBeenCalled();
  });

  it("creates a pending follow and notifies a request for a private target", async () => {
    getUserBasic.mockImplementation(async (id: string) =>
      id === "u2"
        ? { id, name: "Target", isPrivate: true }
        : { id, name: "Me", isPrivate: false },
    );

    const result = await FollowService.sendFollow("u1", "u2");

    expect(result).toEqual({ status: "pending" });
    expect(create).toHaveBeenCalledWith("u1", "u2", "pending");
    expect(notifyFollowRequest).toHaveBeenCalled();
    expect(notifyNewFollower).not.toHaveBeenCalled();
  });

  it("is idempotent — an existing relation is returned, not duplicated", async () => {
    findRow.mockResolvedValue({ status: "accepted" });

    const result = await FollowService.sendFollow("u1", "u2");

    expect(result).toEqual({ status: "accepted" });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("FollowService.removeFollow", () => {
  it("deletes the row and reports 'none'", async () => {
    const result = await FollowService.removeFollow("u1", "u2");

    expect(del).toHaveBeenCalledWith("u1", "u2");
    expect(result).toEqual({ status: "none" });
  });
});
