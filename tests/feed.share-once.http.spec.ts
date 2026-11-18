import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/utils/prisma";
import { signTestSession } from "./helpers/test-session";

/**
 * app#303: POST /feed/:id/share counts one share per signed-in user per post,
 * enforced in the database, so repeated or duplicated requests straight to
 * the API can't inflate a post's share count.
 */
describe("POST /api/v1/feed/:id/share", () => {
  const runId = Math.random().toString(36).slice(2, 8);
  const users: { id: string; token: string }[] = [];
  let postId: string;

  const as = (u: { token: string }) => ({
    Authorization: `Bearer ${u.token}`,
  });
  const share = (u?: { token: string }) => {
    const req = request(app).post(`/api/v1/feed/${postId}/share`);
    return u ? req.set(as(u)) : req;
  };
  const sharesCount = async () =>
    (await prisma.post.findUniqueOrThrow({ where: { id: postId } }))
      .sharesCount;

  beforeAll(async () => {
    for (const tag of ["author", "alice", "bob"]) {
      const user = await prisma.user.create({
        data: {
          email: `share_${tag}_${runId}@test.com`,
          username: `share_${tag}_${runId}`,
          password: "pw",
          roleType: [],
          name: `Share ${tag}`,
        },
      });
      users.push({
        id: user.id,
        token: signTestSession({ userId: user.id, email: user.email }),
      });
    }
    postId = (
      await prisma.post.create({
        data: {
          authorId: users[0].id,
          type: "citizen_experience",
          tab: "community",
          content: "Share once",
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: users.map((u) => u.id) } },
    });
  });

  it("counts the first share and ignores the user's repeats", async () => {
    const [, alice] = users;
    const first = await share(alice);
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ counted: true, sharesCount: 1 });

    for (let i = 0; i < 3; i++) {
      const again = await share(alice);
      expect(again.status).toBe(200);
      expect(again.body.data).toMatchObject({
        counted: false,
        sharesCount: 1,
      });
    }
    expect(await sharesCount()).toBe(1);
  });

  it("counts simultaneous duplicate requests once", async () => {
    const [, , bob] = users;
    const results = await Promise.all(
      Array.from({ length: 5 }, () => share(bob)),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(results.filter((r) => r.body.data.counted)).toHaveLength(1);
    expect(await sharesCount()).toBe(2);
  });

  it("counts another user's share", async () => {
    const [author] = users;
    const res = await share(author);
    expect(res.body.data).toMatchObject({ counted: true, sharesCount: 3 });
  });

  it("lets a guest share without counting it", async () => {
    const res = await share();
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ counted: false, sharesCount: 3 });
    expect(await sharesCount()).toBe(3);
  });

  it("reports isSharedByMe on the post", async () => {
    const [, alice] = users;
    const res = await request(app).get(`/api/v1/feed/${postId}`).set(as(alice));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ isSharedByMe: true, sharesCount: 3 });
  });
});
