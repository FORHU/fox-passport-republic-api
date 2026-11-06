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

  it("puts a rank on each path of the signed-in passport", async () => {
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

    const byPath = Object.fromEntries(
      res.body.data.paths.map(
        (p: { path: string; level: number; rank: unknown }) => [p.path, p],
      ),
    );
    expect(byPath.user.level).toBe(20);
    expect(byPath.user.rank).toMatchObject({
      number: 6,
      name: "Adventurer",
      rarity: "Rare",
      next: { name: "Pioneer", minLevel: 30, levelsToGo: 10 },
    });
    expect(byPath.venueFoxer.rank).toMatchObject({
      number: 2,
      name: "Regular",
    });
  });
});
