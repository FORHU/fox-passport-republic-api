import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/utils/prisma";
import { signTestSession } from "./helpers/test-session";

describe("Onboarding API (Supertest)", () => {
  let userId: string;
  let token: string;

  beforeAll(async () => {
    const runId = Math.random().toString(36).substring(7);
    const user = await prisma.user.create({
      data: {
        email: `onboard_${runId}@test.com`,
        username: `onboard_${runId}`,
        password: "pw",
        roleType: [],
        name: "Onboard",
      },
    });
    userId = user.id;
    token = signTestSession({
      userId,
      email: user.email,
      roleType: user.roleType,
    });
  });

  afterAll(async () => {
    // Deletes only this spec's user; the rows hanging off it cascade.
    await prisma.user.delete({ where: { id: userId } });
  });

  it("refuses a call without a session", async () => {
    const res = await request(app).post("/api/v1/onboarding/intro");
    expect(res.status).toBe(401);
  });

  it("refuses an unknown step", async () => {
    const res = await request(app)
      .post("/api/v1/onboarding/nope")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it("pays the tour once and lists it", async () => {
    const first = await request(app)
      .post("/api/v1/onboarding/intro")
      .set("Authorization", `Bearer ${token}`);
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({
      step: "intro",
      alreadyCompleted: false,
      reward: { xpAwarded: 50, coinsAwarded: 20 },
    });

    const again = await request(app)
      .post("/api/v1/onboarding/intro")
      .set("Authorization", `Bearer ${token}`);
    expect(again.status).toBe(200);
    expect(again.body.data).toMatchObject({
      alreadyCompleted: true,
      reward: { xpAwarded: 0, coinsAwarded: 0 },
    });

    const events = await prisma.rewardEvent.count({
      where: { userId, action: "finish_intro" },
    });
    expect(events).toBe(1);

    const list = await request(app)
      .get("/api/v1/onboarding")
      .set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.steps.map((s: { step: string }) => s.step)).toEqual([
      "intro",
    ]);
  });
});
