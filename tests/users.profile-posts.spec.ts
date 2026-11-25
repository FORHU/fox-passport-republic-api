import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * api#427: a profile's Republic Activity shows only the posts the viewer may
 * see, by the same rule as the feed — public for everyone, "followers" for
 * accepted followers, everything (incl. "only_me") for the author — and each
 * post carries the viewer's own reaction. Prisma is stubbed.
 */

const prisma = vi.hoisted(() => ({
  follow: { findUnique: vi.fn() },
  post: { findMany: vi.fn(), count: vi.fn() },
}));
vi.mock("../src/utils/prisma", () => ({ prisma }));

const { default: UsersRepo } =
  await import("../src/modules/users/users.repository");

const whereOf = () => prisma.post.findMany.mock.calls[0][0].where;

beforeEach(() => {
  vi.clearAllMocks();
  prisma.post.findMany.mockResolvedValue([]);
  prisma.post.count.mockResolvedValue(0);
  prisma.follow.findUnique.mockResolvedValue(null);
});

describe("UsersRepo.findProfilePosts visibility", () => {
  it("shows a signed-out visitor public posts only", async () => {
    await UsersRepo.findProfilePosts("ana");
    expect(whereOf()).toEqual({
      authorId: "ana",
      isArchived: false,
      OR: [{ visibility: "public" }],
    });
    expect(prisma.follow.findUnique).not.toHaveBeenCalled();
  });

  it("shows a non-follower public posts only", async () => {
    await UsersRepo.findProfilePosts("ana", "bo");
    expect(whereOf().OR).toEqual([{ visibility: "public" }]);
  });

  it("keeps followers posts from a pending follow request", async () => {
    prisma.follow.findUnique.mockResolvedValue({ status: "pending" });
    await UsersRepo.findProfilePosts("ana", "bo");
    expect(whereOf().OR).toEqual([{ visibility: "public" }]);
  });

  it("adds followers posts for an accepted follower, never only_me", async () => {
    prisma.follow.findUnique.mockResolvedValue({ status: "accepted" });
    await UsersRepo.findProfilePosts("ana", "bo");
    expect(whereOf().OR).toEqual([
      { visibility: "public" },
      { visibility: "followers" },
    ]);
  });

  it("shows the author everything they posted", async () => {
    await UsersRepo.findProfilePosts("ana", "ana");
    expect(whereOf().OR).toContainEqual({ authorId: "ana" });
  });

  it("counts with the same filter as the list", async () => {
    prisma.follow.findUnique.mockResolvedValue({ status: "accepted" });
    prisma.post.count.mockResolvedValue(7);
    const { count } = await UsersRepo.findProfilePosts("ana", "bo");
    expect(prisma.post.count).toHaveBeenCalledWith({ where: whereOf() });
    expect(count).toBe(7);
  });
});

describe("UsersRepo.findProfilePosts reactions", () => {
  it("gives each post the viewer's reaction", async () => {
    prisma.post.findMany.mockResolvedValue([
      { id: "p1", likes: [{ type: "haha" }] },
      { id: "p2", likes: [] },
    ]);
    const { posts } = await UsersRepo.findProfilePosts("ana", "bo");
    expect(posts).toEqual([
      { id: "p1", myReaction: "haha", isLikedByMe: true },
      { id: "p2", myReaction: null, isLikedByMe: false },
    ]);
    expect(prisma.post.findMany.mock.calls[0][0].select.likes).toEqual({
      where: { userId: "bo" },
      select: { type: true },
    });
  });

  it("asks for no reactions when signed out", async () => {
    prisma.post.findMany.mockResolvedValue([{ id: "p1" }]);
    const { posts } = await UsersRepo.findProfilePosts("ana");
    expect(posts).toEqual([
      { id: "p1", myReaction: null, isLikedByMe: false },
    ]);
    expect(prisma.post.findMany.mock.calls[0][0].select.likes).toBe(false);
  });
});
