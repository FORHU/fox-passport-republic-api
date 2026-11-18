import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/utils/prisma";
import redisUtil from "../src/utils/redis.util";
import RewardSettingsService from "../src/modules/reward-settings/reward-settings.service";
import { REWARD_SETTINGS } from "../src/modules/reward-settings/reward-settings.registry";

/**
 * Reward settings over HTTP (RR-8, api#303): only an admin can read or change
 * them, a change is recorded with who made it and the value before and after,
 * and a reset brings the default back. Real Postgres and Redis, as
 * auth.session-replace.spec.ts.
 */

const PREFIX = "rewardsettings.test.";
const PASSWORD = "SuperSecurePassword123!";
const stamp = Date.now();
const adminEmail = `${PREFIX}admin.${stamp}@example.com`;
const citizenEmail = `${PREFIX}citizen.${stamp}@example.com`;
const BASE = "/api/v1/admin/reward-settings";
const CAP = "dailyLogin.monthlyCapTokens";
const KEYS = Object.keys(REWARD_SETTINGS);

let adminToken = "";
let citizenToken = "";

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const signIn = (email: string) =>
  request(app)
    .post("/api/auth/sign-in/email")
    .send({ email, password: PASSWORD });

async function cleanUp() {
  await prisma.rewardSetting.deleteMany({ where: { key: { in: KEYS } } });
  await prisma.auditLog.deleteMany({
    where: { actorEmail: { startsWith: PREFIX } },
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
  // An unverified email can't sign in; the admin role is set before sign-in so
  // no earlier permission lookup is cached.
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
  expect(adminToken).toBeTruthy();
  expect(citizenToken).toBeTruthy();
}, 60_000);

afterAll(cleanUp);

describe("who may use the reward settings", () => {
  it("refuses someone who is not signed in", async () => {
    expect((await request(app).get(BASE)).status).toBe(401);
    expect(
      (await request(app).put(`${BASE}/${CAP}`).send({ value: 1 })).status,
    ).toBe(401);
  });

  it("refuses a citizen, and changes nothing", async () => {
    expect((await request(app).get(BASE).set(as(citizenToken))).status).toBe(
      403,
    );
    const put = await request(app)
      .put(`${BASE}/${CAP}`)
      .set(as(citizenToken))
      .send({ value: 1 });
    expect(put.status).toBe(403);
    expect(
      (await request(app).delete(`${BASE}/${CAP}`).set(as(citizenToken)))
        .status,
    ).toBe(403);
    expect(await prisma.rewardSetting.count({ where: { key: CAP } })).toBe(0);
  });
});

describe("an admin", () => {
  it("sees every setting with its default", async () => {
    const res = await request(app).get(BASE).set(as(adminToken));
    expect(res.status).toBe(200);
    const keys = res.body.data.map((s: { key: string }) => s.key).sort();
    expect(keys).toEqual([...KEYS].sort());
    const cap = res.body.data.find((s: { key: string }) => s.key === CAP);
    expect(cap).toMatchObject({
      value: REWARD_SETTINGS[CAP].defaultValue,
      defaultValue: REWARD_SETTINGS[CAP].defaultValue,
      overridden: false,
    });
  });

  it("changes a setting, and the app uses it straight away", async () => {
    const res = await request(app)
      .put(`${BASE}/${CAP}`)
      .set(as(adminToken))
      .send({ value: 250 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ value: 250, overridden: true });

    expect(await RewardSettingsService.get(CAP)).toBe(250);
    const list = await request(app).get(BASE).set(as(adminToken));
    expect(
      list.body.data.find((s: { key: string }) => s.key === CAP).value,
    ).toBe(250);
  });

  it("leaves a record of who changed it and the values before and after", async () => {
    await request(app)
      .put(`${BASE}/${CAP}`)
      .set(as(adminToken))
      .send({ value: 300 });

    const rows = await prisma.auditLog.findMany({
      where: {
        action: "rewardSetting.change",
        targetId: CAP,
        actorEmail: adminEmail,
      },
      orderBy: { createdAt: "asc" },
    });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.at(-1)?.metadata).toMatchObject({
      previous: 250,
      current: 300,
    });
    expect(rows.at(-1)?.outcome).toBe("allowed");

    const history = await request(app)
      .get(`${BASE}/${CAP}/history`)
      .set(as(adminToken));
    expect(history.status).toBe(200);
    expect(history.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it.each([
    ["a negative number", -1],
    ["a fraction", 2.5],
    ["text", "lots"],
  ])("cannot set %s", async (_label, value) => {
    const res = await request(app)
      .put(`${BASE}/${CAP}`)
      .set(as(adminToken))
      .send({ value });
    expect(res.status).toBe(400);
    expect(await RewardSettingsService.get(CAP)).toBe(300);
  });

  it("cannot set a setting that does not exist, such as a Token balance", async () => {
    const res = await request(app)
      .put(`${BASE}/tokens.balance`)
      .set(as(adminToken))
      .send({ value: 999999 });
    expect(res.status).toBe(404);
  });

  it("resets a setting to its default", async () => {
    const res = await request(app).delete(`${BASE}/${CAP}`).set(as(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      overridden: false,
      value: REWARD_SETTINGS[CAP].defaultValue,
    });
    expect(await RewardSettingsService.get(CAP)).toBe(
      REWARD_SETTINGS[CAP].defaultValue,
    );
    expect(await prisma.rewardSetting.count({ where: { key: CAP } })).toBe(0);
  });
});
