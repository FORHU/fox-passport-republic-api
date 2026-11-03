import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/utils/prisma";
import redisUtil from "../src/utils/redis.util";

/**
 * Sign-up and /update-user pass extra body fields to the user record, so
 * `systemRole` and `roleType` without `input: false` let anyone make
 * themselves an admin or any Foxer. Real Postgres and Redis.
 */

const PREFIX = "roleinput.test.";
const email = `${PREFIX}${Date.now()}@example.com`;

async function cleanUp() {
  const where = { user: { email: { startsWith: PREFIX } } };
  await prisma.session.deleteMany({ where });
  await prisma.account.deleteMany({ where });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

beforeAll(async () => {
  await redisUtil.initialize().catch(() => {});
  const redis = redisUtil.getClient();
  if (redis) {
    for await (const keys of redis.scanIterator({ MATCH: "rl:register:*" })) {
      const batch = Array.isArray(keys) ? keys : [keys];
      if (batch.length) await redis.del(batch);
    }
  }
  await cleanUp();
});
afterAll(cleanUp);

const stored = () =>
  prisma.user.findUniqueOrThrow({
    where: { email },
    select: { systemRole: true, roleType: true },
  });

describe("roles can't be set from the request", () => {
  let token: string;

  it("sign-up ignores systemRole and roleType", async () => {
    const res = await request(app)
      .post("/api/auth/sign-up/email")
      .send({
        email,
        password: "SuperSecurePassword123!",
        name: "Role Input",
        systemRole: "admin",
        roleType: ["venueFoxer"],
      });
    expect(res.status).toBe(200);
    token = res.body.token;
    expect(await stored()).toEqual({ systemRole: "user", roleType: [] });
  });

  it("/update-user refuses them", async () => {
    const res = await request(app)
      .post("/api/auth/update-user")
      .set("Authorization", `Bearer ${token}`)
      .send({ systemRole: "admin", roleType: ["assetFoxer"] });
    expect(res.status).toBe(400);
    expect(await stored()).toEqual({ systemRole: "user", roleType: [] });
  });
});
