import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { UserPath } from "@prisma/client";
import app from "../src/app";
import { prisma } from "../src/utils/prisma";
import { signTestSession } from "./helpers/test-session";

describe("Passport rank (Supertest)", () => {
  let userId: string;
  let token: string;

  beforeAll(async () => {
    const runId = Math.random().toString(36).substring(7);
    const user = await prisma.user.create({
      data: {
        email: `rank_${runId}@test.com`,
        username: `rank_${runId}`,
        password: "pw",
        roleType: [],
        name: "Rank",
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

  it("sends no level, rank or XP on any path of the signed-in passport", async () => {
    const first = await request(app)
      .get("/api/v1/passport/me")
      .set("Authorization", `Bearer ${token}`);
    expect(first.status).toBe(200);
    expect(first.body.data.paths).toEqual([]);

    const passportId = first.body.data.id as string;
    await prisma.passportPath.createMany({
      data: [
        { passportId, path: UserPath.user, level: 20, totalXP: 15860 },
        { passportId, path: UserPath.venueFoxer, level: 3, totalXP: 530 },
      ],
    });

    const res = await request(app)
      .get("/api/v1/passport/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);

    for (const p of res.body.data.paths as Record<string, unknown>[]) {
      expect(p).not.toHaveProperty("level");
      expect(p).not.toHaveProperty("rank");
      expect(p).not.toHaveProperty("totalXP");
      expect(p).not.toHaveProperty("currentXP");
    }
    expect(res.body.data.paths).toHaveLength(2);
  });
});
