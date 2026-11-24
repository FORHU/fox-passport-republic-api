import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/utils/prisma";
import MatchSvc from "../src/modules/match/match.service";

/**
 * api#465: "Send Match Request" answered 404 for packages a Foxer built
 * themselves. Runs the real service against the test database.
 */

describe("MatchSvc.createMatchRequest", () => {
  const runId = Math.random().toString(36).substring(7);
  const ids: Record<string, string> = {};
  const date = new Date("2027-03-10T10:00:00.000Z");

  const user = (key: string, roleType: string[] = []) =>
    prisma.user.create({
      data: {
        email: `match_${key}_${runId}@test.com`,
        username: `match_${key}_${runId}`,
        password: "pw",
        roleType: roleType as never,
        name: `Match ${key}`,
      },
    });

  beforeAll(async () => {
    ids.client = (await user("client")).id;
    ids.foxer = (await user("foxer", ["eventFoxer"])).id;
    ids.bare = (await user("bare", ["eventFoxer"])).id;
    // A package the Foxer built in the app: private draft, no items yet.
    ids.first = (
      await prisma.eventTemplate.create({
        data: {
          ownerId: ids.foxer,
          name: "Garden party",
          description: "",
          category: "other",
        },
      })
    ).id;
    ids.test = (
      await prisma.eventTemplate.create({
        data: {
          ownerId: ids.foxer,
          name: "test",
          description: "",
          category: "other",
        },
      })
    ).id;
  });

  afterAll(async () => {
    // What the requests created, then the people: bookings hold users.
    const userIds = [ids.client, ids.foxer, ids.bare];
    await prisma.booking.deleteMany({ where: { userId: ids.client } });
    await prisma.event.deleteMany({ where: { clientId: ids.client } });
    await prisma.eventTemplate.deleteMany({
      where: { ownerId: { in: userIds } },
    });
    await prisma.notification.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  const request = (foxerId: string, style: string) =>
    MatchSvc.createMatchRequest({
      clientId: ids.client,
      foxerId,
      style,
      date,
      guestCount: 1,
      requestContent: "",
    });

  it("uses the package the client picked, by name", async () => {
    const { eventRequest } = await request(ids.foxer, "test");
    expect(eventRequest.templateId).toBe(ids.test);
  });

  it("falls back to the Foxer's first package for an unknown name", async () => {
    const { eventRequest } = await request(ids.foxer, "Own idea");
    expect([ids.first, ids.test]).toContain(eventRequest.templateId);
  });

  // The template is created inside the request's transaction; reading it
  // back with the bare client found nothing, so this always failed.
  it("works for a Foxer with no package yet", async () => {
    const { eventRequest, booking } = await request(ids.bare, "Own idea");
    expect(eventRequest.id).toBeTruthy();
    expect(booking.status).toBe("pending");
    const template = await prisma.eventTemplate.findUnique({
      where: { id: eventRequest.templateId! },
    });
    expect(template).toMatchObject({
      ownerId: ids.bare,
      name: "Custom Vibe Match",
    });
  });

  it("still answers 404 for a Foxer id that is no user", async () => {
    await expect(
      request("00000000-0000-0000-0000-000000000000", "test"),
    ).rejects.toMatchObject({ status: 404, message: "Foxer not found" });
  });
});
