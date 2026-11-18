import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/utils/prisma";
import redisUtil from "../src/utils/redis.util";
import RewardRepo from "../src/modules/reward/reward.repository";

/**
 * The admin reward screens over HTTP (RR-8, api#303, slice B): only an admin
 * may use them, every change is recorded with the values before and after, and
 * what must not change does not: a key, a milestone's counter, a challenge's
 * window, a tier that has paid, a reward that has been redeemed. Real Postgres
 * and Redis, as reward-settings.integration.test.ts.
 */

const PREFIX = "rewardadmin.test.";
const PASSWORD = "SuperSecurePassword123!";
const stamp = Date.now();
const adminEmail = `${PREFIX}admin.${stamp}@example.com`;
const citizenEmail = `${PREFIX}citizen.${stamp}@example.com`;
const BASE = "/api/v1/admin/rewards";
const MS_KEY = `rrtest_ms_${stamp}`;
const CH_KEY = `rrtest_ch_${stamp}`;
const RULE_ACTION = `rrtest_rule_${stamp}`;
const TITLE = "RRTEST reward";

let adminToken = "";
let citizenToken = "";
let citizenId = "";
let ruleId = "";

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const admin = {
  get: (path: string) =>
    request(app)
      .get(BASE + path)
      .set(as(adminToken)),
  post: (path: string, body: object) =>
    request(app)
      .post(BASE + path)
      .set(as(adminToken))
      .send(body),
  patch: (path: string, body: object) =>
    request(app)
      .patch(BASE + path)
      .set(as(adminToken))
      .send(body),
  del: (path: string) =>
    request(app)
      .delete(BASE + path)
      .set(as(adminToken)),
};
const signIn = (email: string) =>
  request(app)
    .post("/api/auth/sign-in/email")
    .send({ email, password: PASSWORD });
const auditRows = (targetId: string, action: string) =>
  prisma.auditLog.findMany({
    where: { targetId, action, actorEmail: adminEmail },
    orderBy: { createdAt: "asc" },
  });

async function cleanUp() {
  await prisma.auditLog.deleteMany({
    where: { actorEmail: { startsWith: PREFIX } },
  });
  await prisma.rewardEvent.deleteMany({
    where: { idempotencyKey: { startsWith: `rrtest:${stamp}` } },
  });
  await prisma.milestone.deleteMany({
    where: { key: { startsWith: "rrtest_" } },
  });
  await prisma.challenge.deleteMany({
    where: { key: { startsWith: "rrtest_" } },
  });
  await prisma.coinReward.deleteMany({
    where: { title: { startsWith: "RRTEST" } },
  });
  await prisma.rewardRule.deleteMany({
    where: { action: { startsWith: "rrtest_" } },
  });
  const where = { user: { email: { startsWith: PREFIX } } };
  await prisma.session.deleteMany({ where });
  await prisma.account.deleteMany({ where });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

beforeAll(async () => {
  await redisUtil.initialize().catch(() => {});
  const redis = redisUtil.getClient();
  if (redis) {
    for (const match of ["rl:login:*", "rl:register:*"]) {
      for await (const keys of redis.scanIterator({ MATCH: match })) {
        const batch = Array.isArray(keys) ? keys : [keys];
        if (batch.length) await redis.del(batch);
      }
    }
  }
  await cleanUp();
  for (const [email, name] of [
    [adminEmail, "Ada Admin"],
    [citizenEmail, "Cy Citizen"],
  ]) {
    const res = await request(app)
      .post("/api/auth/sign-up/email")
      .send({ email, password: PASSWORD, name });
    expect(res.status).toBe(200);
  }
  await prisma.user.updateMany({
    where: { email: { in: [adminEmail, citizenEmail] } },
    data: { isEmailVerified: true },
  });
  await prisma.user.update({
    where: { email: adminEmail },
    data: { systemRole: "admin" },
  });
  adminToken = (await signIn(adminEmail)).body.token;
  citizenToken = (await signIn(citizenEmail)).body.token;
  citizenId = (
    await prisma.user.findUniqueOrThrow({ where: { email: citizenEmail } })
  ).id;
  ruleId = (
    await prisma.rewardRule.create({
      data: { action: RULE_ACTION, coins: 10, dailyCap: 1, onceOnly: false },
    })
  ).id;
}, 60_000);

afterAll(cleanUp);

describe("who may use the admin reward screens", () => {
  it("refuses someone who is not signed in", async () => {
    expect((await request(app).get(`${BASE}/rules`)).status).toBe(401);
    expect((await request(app).post(`${BASE}/catalog`).send({})).status).toBe(
      401,
    );
  });

  it("refuses a citizen on every area, and changes nothing", async () => {
    for (const path of ["/rules", "/milestones", "/challenges", "/catalog"]) {
      const res = await request(app)
        .get(BASE + path)
        .set(as(citizenToken));
      expect(res.status, path).toBe(403);
    }
    const patch = await request(app)
      .patch(`${BASE}/rules/${ruleId}`)
      .set(as(citizenToken))
      .send({ coins: 9999 });
    expect(patch.status).toBe(403);
    expect(
      (await prisma.rewardRule.findUniqueOrThrow({ where: { id: ruleId } }))
        .coins,
    ).toBe(10);
  });
});

describe("reward rules", () => {
  it("changes the Tokens a rule pays, and records the values before and after", async () => {
    const res = await admin.patch(`/rules/${ruleId}`, { coins: 20 });
    expect(res.status).toBe(200);
    expect(res.body.data.coins).toBe(20);

    const rows = await auditRows(ruleId, "rewardRule.change");
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toMatchObject({
      action: RULE_ACTION,
      previous: { coins: 10 },
      current: { coins: 20 },
    });
  });

  it("writes nothing when nothing changes", async () => {
    const res = await admin.patch(`/rules/${ruleId}`, { coins: 20 });
    expect(res.status).toBe(200);
    expect(await auditRows(ruleId, "rewardRule.change")).toHaveLength(1);
  });

  it.each([
    ["a negative amount", { coins: -1 }],
    ["a fraction", { coins: 1.5 }],
    ["the rule's action", { action: "other" }],
    ["the retired XP", { xp: 500 }],
    ["nothing at all", {}],
  ])("refuses %s", async (_label, body) => {
    expect((await admin.patch(`/rules/${ruleId}`, body)).status).toBe(400);
  });

  it("says so for a rule that does not exist", async () => {
    const res = await admin.patch(
      "/rules/3f2c1b5e-0000-4000-8000-000000000000",
      {
        coins: 1,
      },
    );
    expect(res.status).toBe(404);
  });
});

describe("milestones and tiers", () => {
  let milestoneId = "";

  it("creates a milestone, and refuses a second with the same key", async () => {
    const res = await admin.post("/milestones", {
      key: MS_KEY,
      name: "RRTEST milestone",
      counter: "booked_events",
    });
    expect(res.status).toBe(201);
    milestoneId = res.body.data.id;
    expect(res.body.data.counts).toBe("attended");
    expect(
      (
        await admin.post("/milestones", {
          key: MS_KEY,
          name: "x",
          counter: "venues",
        })
      ).status,
    ).toBe(409);
  });

  it.each([
    ["its key", { key: "rrtest_other" }],
    ["what it counts", { counter: "venues" }],
    ["when it counts", { counts: "paid" }],
  ])("cannot change %s once created", async (_label, body) => {
    expect((await admin.patch(`/milestones/${milestoneId}`, body)).status).toBe(
      400,
    );
  });

  it("renames it and switches it off, with a record", async () => {
    const res = await admin.patch(`/milestones/${milestoneId}`, {
      name: "RRTEST renamed",
      active: false,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      name: "RRTEST renamed",
      active: false,
    });
    const rows = await auditRows(milestoneId, "milestone.change");
    expect(rows[0].metadata).toMatchObject({
      key: MS_KEY,
      previous: { name: "RRTEST milestone", active: true },
      current: { name: "RRTEST renamed", active: false },
    });
  });

  it("adds tiers whose targets grow, and refuses ones that do not", async () => {
    expect(
      (
        await admin.post(`/milestones/${milestoneId}/tiers`, {
          tier: 1,
          target: 3,
          tokens: 10,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await admin.post(`/milestones/${milestoneId}/tiers`, {
          tier: 2,
          target: 10,
          tokens: 30,
        })
      ).status,
    ).toBe(201);
    // Needs less than tier 2, or the same as tier 1.
    expect(
      (
        await admin.post(`/milestones/${milestoneId}/tiers`, {
          tier: 3,
          target: 5,
          tokens: 5,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.post(`/milestones/${milestoneId}/tiers`, {
          tier: 1,
          target: 99,
          tokens: 5,
        })
      ).status,
    ).toBe(409);
  });

  it("changes a tier's Tokens, but not so its target stops growing", async () => {
    const tokens = await admin.patch(`/milestones/${milestoneId}/tiers/2`, {
      tokens: 40,
    });
    expect(tokens.status).toBe(200);
    expect(tokens.body.data.tokens).toBe(40);

    expect(
      (await admin.patch(`/milestones/${milestoneId}/tiers/2`, { target: 3 }))
        .status,
    ).toBe(400);
    expect(
      (await admin.patch(`/milestones/${milestoneId}/tiers/2`, { tier: 5 }))
        .status,
    ).toBe(400);

    const rows = await auditRows(milestoneId, "milestoneTier.change");
    expect(rows.at(-1)?.metadata).toMatchObject({
      tier: 2,
      previous: { tokens: 30 },
      current: { tokens: 40 },
    });
  });

  it("will not delete a tier that has paid someone, but will delete one that has not", async () => {
    await prisma.rewardEvent.create({
      data: {
        userId: citizenId,
        path: "user",
        action: "milestone_tier",
        refType: "milestone_tier",
        refId: `${MS_KEY}:1`,
        coins: 10,
        idempotencyKey: `rrtest:${stamp}:tier1`,
      },
    });

    const blocked = await admin.del(`/milestones/${milestoneId}/tiers/1`);
    expect(blocked.status).toBe(409);
    expect(
      await prisma.milestoneTier.count({ where: { milestoneId, tier: 1 } }),
    ).toBe(1);

    const allowed = await admin.del(`/milestones/${milestoneId}/tiers/2`);
    expect(allowed.status).toBe(204);
    expect(
      await prisma.milestoneTier.count({ where: { milestoneId, tier: 2 } }),
    ).toBe(0);
    expect(await auditRows(milestoneId, "milestoneTier.delete")).toHaveLength(
      1,
    );
  });

  it("shows its history, and there is no way to delete the milestone itself", async () => {
    const history = await admin.get(`/milestones/${milestoneId}/history`);
    expect(history.status).toBe(200);
    expect(history.body.data.length).toBeGreaterThanOrEqual(4);
    expect(
      (
        await request(app)
          .delete(`${BASE}/milestones/${milestoneId}`)
          .set(as(adminToken))
      ).status,
    ).toBe(404);
  });
});

describe("challenges", () => {
  let challengeId = "";

  it("creates one, and refuses a window that ends before it starts", async () => {
    const res = await admin.post("/challenges", {
      key: CH_KEY,
      name: "RRTEST challenge",
      period: "week",
      target: 3,
      tokens: 25,
    });
    expect(res.status).toBe(201);
    challengeId = res.body.data.id;

    expect(
      (
        await admin.post("/challenges", {
          key: `${CH_KEY}_b`,
          name: "x",
          period: "day",
          target: 1,
          tokens: 1,
          startsAt: "2026-12-10T00:00:00Z",
          endsAt: "2026-12-01T00:00:00Z",
        })
      ).status,
    ).toBe(400);
  });

  it("cannot change its key or its window once created", async () => {
    expect(
      (await admin.patch(`/challenges/${challengeId}`, { key: "rrtest_x" }))
        .status,
    ).toBe(400);
    expect(
      (await admin.patch(`/challenges/${challengeId}`, { period: "month" }))
        .status,
    ).toBe(400);
  });

  it("changes the target and Tokens with a record, and keeps the window valid", async () => {
    const res = await admin.patch(`/challenges/${challengeId}`, {
      tokens: 50,
      target: 4,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ tokens: 50, target: 4 });
    const rows = await auditRows(challengeId, "challenge.change");
    expect(rows[0].metadata).toMatchObject({
      key: CH_KEY,
      previous: { tokens: 25, target: 3 },
      current: { tokens: 50, target: 4 },
    });

    await admin.patch(`/challenges/${challengeId}`, {
      startsAt: "2026-12-01T00:00:00Z",
    });
    expect(
      (
        await admin.patch(`/challenges/${challengeId}`, {
          endsAt: "2026-11-01T00:00:00Z",
        })
      ).status,
    ).toBe(400);
  });
});

describe("the rewards catalogue", () => {
  let rewardId = "";

  it("creates a voucher and shows the discount as a number", async () => {
    const res = await admin.post("/catalog", {
      title: TITLE,
      coinCost: 500,
      rewardType: "booking_voucher",
      discountPhp: 100,
    });
    expect(res.status).toBe(201);
    rewardId = res.body.data.id;
    expect(res.body.data.discountPhp).toBe(100);
    expect(
      (await admin.get(`/catalog/${rewardId}`)).body.data.discountPhp,
    ).toBe(100);
    expect(
      (await RewardRepo.findRewardsCatalog("citizen")).some(
        (r) => r.id === rewardId,
      ),
    ).toBe(true);
  });

  it("refuses a discount reward with no discount, and a boost with one", async () => {
    expect(
      (
        await admin.post("/catalog", {
          title: "RRTEST none",
          coinCost: 5,
          rewardType: "fee_discount",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.post("/catalog", {
          title: "RRTEST boost",
          coinCost: 5,
          rewardType: "listing_boost",
          discountPhp: 10,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.post("/catalog", {
          title: "RRTEST bad",
          coinCost: 5,
          rewardType: "gold",
        })
      ).status,
    ).toBe(400);
  });

  it("changes the price with a record, but not its type", async () => {
    const res = await admin.patch(`/catalog/${rewardId}`, { coinCost: 600 });
    expect(res.status).toBe(200);
    expect(res.body.data.coinCost).toBe(600);
    expect(
      (await auditRows(rewardId, "coinReward.change"))[0].metadata,
    ).toMatchObject({
      previous: { coinCost: 500 },
      current: { coinCost: 600 },
    });
    expect(
      (
        await admin.patch(`/catalog/${rewardId}`, {
          rewardType: "listing_boost",
        })
      ).status,
    ).toBe(400);
    // Removing the discount from a discount reward would leave it worth nothing.
    expect(
      (await admin.patch(`/catalog/${rewardId}`, { discountPhp: null })).status,
    ).toBe(400);
  });

  it("switches a reward off, so citizens stop seeing it, and an admin still does", async () => {
    const res = await admin.patch(`/catalog/${rewardId}`, { active: false });
    expect(res.status).toBe(200);
    expect(
      (await RewardRepo.findRewardsCatalog("citizen")).some(
        (r) => r.id === rewardId,
      ),
    ).toBe(false);
    const list = await admin.get("/catalog");
    expect(
      list.body.data.find((r: { id: string }) => r.id === rewardId)?.active,
    ).toBe(false);
    expect(
      (
        await request(app)
          .delete(`${BASE}/catalog/${rewardId}`)
          .set(as(adminToken))
      ).status,
    ).toBe(404);
  });
});
