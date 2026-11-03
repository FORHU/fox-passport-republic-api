import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/utils/prisma";
import FeedService from "../src/modules/feed/feed.service";
import { AuthenticatedUser } from "../src/types/auth";

// Notifications are written without being waited for, so look for them.
async function notificationsOf(userId: string, type: string) {
  for (let i = 0; i < 40; i++) {
    const rows = await prisma.notification.findMany({
      where: { userId, type },
    });
    if (rows.length > 0) return rows;
    await new Promise((r) => setTimeout(r, 50));
  }
  return [];
}

describe("Republic notifications", () => {
  const runId = Math.random().toString(36).substring(7);
  const ids: Record<string, string> = {};
  let postId: string;
  let ownerComment: string;
  let guestComment: string;

  const as = (key: string): AuthenticatedUser => ({
    userId: ids[key],
    email: `${key}_${runId}@test.com`,
    systemRole: "user",
    roleType: [],
  });

  beforeAll(async () => {
    for (const [key, name] of [
      ["owner", "Olive Owner"],
      ["guest", "Gus Guest"],
      ["other", "Orla Other"],
    ]) {
      const u = await prisma.user.create({
        data: {
          email: `${key}_${runId}@test.com`,
          username: `${key}_${runId}`,
          password: "pw",
          roleType: [],
          name,
        },
      });
      ids[key] = u.id;
    }
    const post = await prisma.post.create({
      data: {
        authorId: ids.owner,
        type: "citizen_experience",
        tab: "community",
        content: "Open mic on Friday",
      },
    });
    postId = post.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
  });

  it("says who reacted by name, not by email", async () => {
    await FeedService.setReaction(postId, as("guest"), "like");

    const [n] = await notificationsOf(ids.owner, "feed:like");
    expect(n.message).toBe("Gus Guest reacted to your post.");
    expect(n.message).not.toContain("@test.com");
  });

  it("says who commented on a post", async () => {
    const c = await FeedService.addComment(postId, as("guest"), "Count me in");
    guestComment = c.id;

    const [n] = await notificationsOf(ids.owner, "feed:comment");
    expect(n.message).toBe('Gus Guest commented on your post: "Count me in"');
  });

  it("tells a comment's author about a reply to it", async () => {
    await FeedService.addComment(
      postId,
      as("other"),
      "Same here",
      guestComment,
    );

    const [n] = await notificationsOf(ids.guest, "feed:reply");
    expect(n.message).toBe('Orla Other replied to your comment: "Same here"');
    expect(n.metadata).toMatchObject({ postId, commentId: expect.any(String) });
  });

  it("does not tell the post's author twice about a reply to their comment", async () => {
    const mine = await FeedService.addComment(
      postId,
      as("owner"),
      "Doors at 7",
    );
    ownerComment = mine.id;
    await FeedService.addComment(postId, as("guest"), "Thanks", ownerComment);

    await notificationsOf(ids.owner, "feed:comment");
    const replies = await prisma.notification.findMany({
      where: { userId: ids.owner, type: "feed:reply" },
    });
    expect(replies).toHaveLength(0);
  });

  it("names who mentioned you", async () => {
    await FeedService.addComment(postId, as("guest"), `hi @other_${runId}`);

    const [n] = await notificationsOf(ids.other, "feed:mention");
    expect(n.message).toBe("Gus Guest mentioned you in a comment.");
  });
});
