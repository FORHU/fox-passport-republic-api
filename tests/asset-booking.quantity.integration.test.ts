import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/utils/prisma";
import redisUtil from "../src/utils/redis.util";
import {
  BOOKING_QUANTITY_MAX,
  bookingQuantity,
} from "../src/modules/asset-booking/asset-booking.controller";

/**
 * How many units a booking can ask for (mobile#382): a whole number from 1 to
 * 999. The app limits what can be typed, but the API refuses the rest on its
 * own, whatever the app does. Real Postgres and Redis, as
 * reward-settings.integration.test.ts.
 */

describe("the booking quantity rule", () => {
  const check = (value: unknown) => bookingQuantity().validate(value);

  it("accepts a whole number from 1 to the maximum", () => {
    expect(BOOKING_QUANTITY_MAX).toBe(999);
    for (const ok of [1, 2, 50, 998, 999]) {
      expect(check(ok).error, String(ok)).toBeUndefined();
    }
  });

  it.each([
    ["zero", 0],
    ["a negative number", -3],
    ["a decimal", 2.5],
    ["one over the maximum", 1000],
    ["far over the maximum", 1_000_000],
    ["text", "lots"],
    ["nothing", undefined],
    ["null", null],
  ])("refuses %s", (_label, value) => {
    expect(check(value).error).toBeDefined();
  });
});

describe("the booking endpoints", () => {
  const PREFIX = "assetqty.test.";
  const PASSWORD = "SuperSecurePassword123!";
  const email = `${PREFIX}citizen.${Date.now()}@example.com`;
  let token = "";

  const as = () => ({ Authorization: `Bearer ${token}` });
  const day = (offset: number) =>
    new Date(Date.now() + offset * 86_400_000).toISOString();
  const base = {
    assetId: "does-not-matter",
    startDate: day(10),
    endDate: day(12),
    fulfillmentType: "pickup",
  };

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
      for (const match of ["rl:login:*", "rl:register:*"]) {
        for await (const keys of redis.scanIterator({ MATCH: match })) {
          const batch = Array.isArray(keys) ? keys : [keys];
          if (batch.length) await redis.del(batch);
        }
      }
    }
    await cleanUp();
    const up = await request(app)
      .post("/api/auth/sign-up/email")
      .send({ email, password: PASSWORD, name: "Quinn Quantity" });
    expect(up.status).toBe(200);
    await prisma.user.update({
      where: { email },
      data: { isEmailVerified: true },
    });
    const res = await request(app)
      .post("/api/auth/sign-in/email")
      .send({ email, password: PASSWORD });
    token = res.body.token;
    expect(token).toBeTruthy();
  }, 60_000);

  afterAll(cleanUp);

  it.each([
    ["more than 999", 1000],
    ["a decimal", 2.5],
    ["a negative number", -1],
    ["zero", 0],
  ])("refuses to create a booking for %s", async (_label, quantity) => {
    const res = await request(app)
      .post("/api/v1/asset/bookings")
      .set(as())
      .send({ ...base, quantity });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/quantity/i);
  });

  it.each([
    ["more than 999", "1000"],
    ["a decimal", "2.5"],
    ["a negative number", "-1"],
    ["text", "lots"],
  ])("refuses a price preview for %s", async (_label, quantity) => {
    const res = await request(app)
      .get("/api/v1/asset/bookings/price-preview")
      .set(as())
      .query({
        assetId: base.assetId,
        startDate: base.startDate,
        endDate: base.endDate,
        quantity,
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/quantity/i);
  });

  it("lets the largest allowed quantity through to the booking rules", async () => {
    // 999 passes this check; the booking itself then fails for another reason
    // (no such asset), which is not about the quantity.
    const res = await request(app)
      .post("/api/v1/asset/bookings")
      .set(as())
      .send({ ...base, quantity: 999 });
    expect(res.status).toBe(400);
    expect(res.body.message).not.toMatch(/quantity/i);
  });
});
