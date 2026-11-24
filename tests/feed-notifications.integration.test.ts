import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/utils/prisma";
import FeedService from "../src/modules/feed/feed.service";
import NotificationService from "../src/modules/notifications/user-notification.service";
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

  // api#450: each notification says where it leads.
  describe("routing data", () => {
    it("points a reaction at the post", async () => {
      const [n] = await notificationsOf(ids.owner, "feed:like");
      expect(n.metadata).toMatchObject({
        postId,
        commentId: null,
        parentCommentId: null,
        targetType: "post",
      });
    });

    it("points a comment at the post and the comment", async () => {
      const rows = await notificationsOf(ids.owner, "feed:comment");
      const n = rows.find(
        (r) =>
          (r.metadata as { commentId?: string }).commentId === guestComment,
      );
      expect(n?.metadata).toMatchObject({
        postId,
        commentId: guestComment,
        parentCommentId: null,
        targetType: "comment",
      });
    });

    it("points a reply at the post, the reply and the comment it answers", async () => {
      const [n] = await notificationsOf(ids.guest, "feed:reply");
      expect(n.metadata).toMatchObject({
        postId,
        parentCommentId: guestComment,
        targetType: "reply",
      });
    });

    it("tells the post's author a reply on their post is a reply", async () => {
      const rows = await notificationsOf(ids.owner, "feed:comment");
      // The guest's "Thanks" answered the owner's own comment, so the owner
      // heard about it once, as a comment on their post - pointing at a reply.
      const reply = await prisma.postComment.findFirst({
        where: { parentId: ownerComment, content: "Thanks" },
      });
      const n = rows.find(
        (r) => (r.metadata as { commentId?: string }).commentId === reply?.id,
      );
      expect(n?.metadata).toMatchObject({
        postId,
        commentId: reply!.id,
        parentCommentId: ownerComment,
        targetType: "reply",
      });
    });

    it("points a mention inside a reply at the reply and its parent", async () => {
      const reply = await FeedService.addComment(
        postId,
        as("guest"),
        `see you @other_${runId}`,
        ownerComment,
      );
      let n;
      for (let i = 0; i < 40 && !n; i++) {
        n = await prisma.notification.findFirst({
          where: {
            userId: ids.other,
            type: "feed:mention",
            metadata: { path: ["commentId"], equals: reply.id },
          },
        });
        if (!n) await new Promise((r) => setTimeout(r, 50));
      }
      expect(n?.metadata).toMatchObject({
        postId,
        commentId: reply.id,
        parentCommentId: ownerComment,
        targetType: "reply",
      });
    });

    it("gives a comment like the post it is on", async () => {
      await FeedService.toggleCommentLike(guestComment, as("owner"));

      const [n] = await notificationsOf(ids.guest, "feed:comment_like");
      expect(n.metadata).toMatchObject({
        postId,
        commentId: guestComment,
        targetType: "comment",
      });
    });

    it("lists a deleted comment as unavailable instead of failing", async () => {
      const doomed = await FeedService.addComment(
        postId,
        as("other"),
        "This will go",
      );
      let n;
      for (let i = 0; i < 40 && !n; i++) {
        n = await prisma.notification.findFirst({
          where: {
            userId: ids.owner,
            type: "feed:comment",
            metadata: { path: ["commentId"], equals: doomed.id },
          },
        });
        if (!n) await new Promise((r) => setTimeout(r, 50));
      }
      expect(n).not.toBeNull();
      await FeedService.deleteComment(doomed.id, as("other"));

      const { notifications } = await NotificationService.getForUser(
        ids.owner,
        100,
      );
      const listed = notifications.find((x) => x.id === n!.id);
      expect(listed?.target).toEqual({
        type: "comment",
        postId,
        commentId: doomed.id,
        parentCommentId: null,
        available: false,
      });
      const live = notifications.find(
        (x) => x.type === "feed:like" && x.target?.postId === postId,
      );
      expect(live?.target).toMatchObject({ type: "post", available: true });
    });

    it("lists notifications about a deleted post as unavailable", async () => {
      const gone = await prisma.post.create({
        data: {
          authorId: ids.owner,
          type: "citizen_experience",
          tab: "community",
          content: "Short-lived",
        },
      });
      await FeedService.setReaction(gone.id, as("other"), "like");
      for (let i = 0; i < 40; i++) {
        const c = await prisma.notification.count({
          where: {
            userId: ids.owner,
            type: "feed:like",
            metadata: { path: ["postId"], equals: gone.id },
          },
        });
        if (c > 0) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      await prisma.post.delete({ where: { id: gone.id } });

      const { notifications } = await NotificationService.getForUser(
        ids.owner,
        100,
      );
      const listed = notifications.find((x) => x.target?.postId === gone.id);
      expect(listed?.target).toMatchObject({ type: "post", available: false });
    });
  });
});
