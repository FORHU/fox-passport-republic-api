import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/utils/prisma";
import { signTestSession } from "./helpers/test-session";

describe("Citizen leaderboard (Supertest)", () => {
  const runId = Math.random().toString(36).substring(7);
  const city = `Citytown_${runId}`;
  const userIds: string[] = [];
  const id: Record<string, string> = {};
  const token: Record<string, string> = {};
  let seq = 0;

  async function citizen(
    label: string,
    inCity: boolean,
    level: number,
    totalXP: number,
  ) {
    const u = await prisma.user.create({
      data: {
        email: `${label}_${runId}@test.com`,
        username: `${label}_${runId}`,
        password: "pw",
        roleType: [],
        name: label,
        city: inCity ? city : null,
      },
    });
    userIds.push(u.id);
    id[label] = u.id;
    token[label] = signTestSession({
      userId: u.id,
      email: u.email,
      roleType: u.roleType,
    });
    const passport = await prisma.passport.create({ data: { userId: u.id } });
    await prisma.passportPath.create({
      data: { passportId: passport.id, path: "user", level, totalXP },
    });
    return u;
  }

  async function grant(userId: string, xp: number, createdAt = new Date()) {
    seq += 1;
    return prisma.rewardEvent.create({
      data: {
        userId,
        path: "user",
        action: "post_feed",
        refType: "test",
        refId: `r${seq}`,
        xp,
        idempotencyKey: `lbc_${runId}_${seq}`,
        createdAt,
      },
    });
  }

  beforeAll(async () => {
    await citizen("a", true, 5, 1500);
    await citizen("b", true, 5, 1200);
    await citizen("c", true, 3, 600);
    await citizen("d", false, 10, 4000);

    const lastMonth = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    // This month: b 300, a 150, d 40, c 20.
    await grant(id.a, 100);
    await grant(id.a, 50);
    await grant(id.a, 9999, lastMonth); // last month: not counted
    await grant(id.b, 300);
    await grant(id.d, 40);
    await grant(id.c, 20);
    await grant(id.c, 0); // pays nothing
    // c's big grant was reversed (a refund), so it earns nothing.
    const refunded = await grant(id.c, 500);
    await prisma.rewardLifecycle.create({
      data: {
        grantEventId: refunded.id,
        userId: id.c,
        type: "REVERSAL",
        coinsDelta: 0,
      },
    });
  });

  afterAll(async () => {
    await prisma.rewardEvent.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  const get = (qs: string, who = "a") =>
    request(app)
      .get(`/api/v1/leaderboard/citizens?${qs}`)
      .set("Authorization", `Bearer ${token[who]}`);

  /** Only the users this spec made, in the order the board lists them. */
  const mine = (rows: { userId: string }[]) =>
    rows.map((r) => r.userId).filter((u) => userIds.includes(u));

  it("refuses a call without a session", async () => {
    const res = await request(app).get("/api/v1/leaderboard/citizens");
    expect(res.status).toBe(401);
  });

  it("refuses an unknown tab", async () => {
    expect((await get("tab=week")).status).toBe(400);
  });

  it("this month ranks by XP gained, leaving out last month and reversed grants", async () => {
    const res = await get("tab=month&limit=50");

    expect(res.status).toBe(200);
    expect(res.body.data.month).toMatch(/^\d{4}-\d{2}$/);
    expect(mine(res.body.data.rows)).toEqual([id.b, id.a, id.d, id.c]);
    // c has only 20 of their own XP left, so they are below d.
    expect(res.body.data.me).toMatchObject({ userId: id.a, isMe: true });
  });

  it("all time ranks by level, then XP, and has no month", async () => {
    const res = await get("tab=all&limit=50");

    expect(res.status).toBe(200);
    expect(res.body.data.month).toBeNull();
    expect(mine(res.body.data.rows)).toEqual([id.d, id.a, id.b, id.c]);
  });

  it("my city ranks only the caller's own city", async () => {
    const res = await get("tab=city&limit=50");

    expect(res.status).toBe(200);
    expect(res.body.data.city).toBe(city);
    const rows = res.body.data.rows as { userId: string; position: number }[];
    expect(rows.map((r) => r.userId)).toEqual([id.b, id.a, id.c]);
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3]);
    expect(res.body.data.me).toMatchObject({ userId: id.a, position: 2 });
  });

  it("my city is empty, not an error, for a caller with no city", async () => {
    const res = await get("tab=city", "d");

    expect(res.status).toBe(200);
    expect(res.body.data.rows).toEqual([]);
    expect(res.body.data.me).toBeNull();
  });

  it("shows rank and level but never XP", async () => {
    const res = await get("tab=month&limit=50");

    const row = res.body.data.rows.find(
      (r: { userId: string }) => r.userId === id.a,
    );
    expect(row).toMatchObject({
      level: 5,
      rank: { number: 3, name: "Explorer" },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/"(xp|totalXP|gained)"/i);
  });
});
