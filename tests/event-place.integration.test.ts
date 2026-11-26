import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../src/app";
import { prisma } from "../src/utils/prisma";
import AdminSvc from "../src/modules/admin/admin.service";
import EventRequestRepo from "../src/modules/event-request/event-request.repository";
import EventTemplateSvc from "../src/modules/event-template/event-template.service";
import UsersSvc from "../src/modules/users/users.service";
import { createTestToken } from "./setup";

/** Every event has a Venue or a Place (epic #517, api#520). */
describe("events and packages at a Place", () => {
  const run = Math.random().toString(36).slice(2, 8);
  const ids = { owner: "", guest: "", other: "", admin: "" };
  const tokens = { owner: "", guest: "", other: "", admin: "" };
  let venue = "";
  let place = "";
  let othersPlace = "";
  let template = "";

  const DAY = 86_400_000;
  const startAt = new Date(Date.now() + 30 * DAY);
  const endAt = new Date(startAt.getTime() + DAY / 4);
  const conflict = { status: 409, code: "LOCATION_CONFLICT" };

  const makePlace = async (creatorId: string, name: string) =>
    (
      await prisma.place.create({
        data: {
          creatorId,
          name: `${name} ${run}`,
          addressLine: "12 Mabini Street",
          city: "City of Tagaytay",
          state: "Cavite",
          lat: 14.1,
          lng: 120.9,
          notes: "Gate code 4521",
        },
      })
    ).id;

  beforeAll(async () => {
    for (const [key, roleType, systemRole] of [
      ["owner", ["eventFoxer", "venueFoxer"], "user"],
      ["guest", [], "user"],
      ["other", [], "user"],
      ["admin", [], "admin"],
    ] as const) {
      const email = `event-place-${key}-${run}@test.com`;
      const user = await prisma.user.create({
        data: {
          email,
          username: `event_place_${key}_${run}`,
          password: "pw",
          name: `Event place ${key}`,
          roleType: [...roleType],
          systemRole,
        },
      });
      ids[key] = user.id;
      tokens[key] = createTestToken(user.id, email, [...roleType], systemRole);
    }
    venue = (
      await prisma.venue.create({
        data: {
          mayorId: ids.owner,
          category: "indoor",
          name: `Place rule hall ${run}`,
          description: "A hall",
          capacity: 100,
          price: 1000,
          billingRate: "daily",
          address: "1 Test Street",
          city: "Manila",
          country: "Philippines",
          status: "available",
        },
      })
    ).id;
    place = await makePlace(ids.owner, "Garden");
    othersPlace = await makePlace(ids.other, "Someone's home");
  });

  beforeEach(async () => {
    template = (
      await prisma.eventTemplate.create({
        data: {
          ownerId: ids.owner,
          name: `Place package ${run}`,
          description: "A package",
          category: "social",
          targetCity: "City of Tagaytay",
          targetCountry: "Philippines",
        },
      })
    ).id;
  });

  afterAll(async () => {
    const all = Object.values(ids);
    await prisma.booking.deleteMany({ where: { userId: { in: all } } });
    await prisma.event.deleteMany({ where: { organizerId: ids.owner } });
    await prisma.eventTemplate.deleteMany({ where: { ownerId: ids.owner } });
    await prisma.place.deleteMany({ where: { creatorId: { in: all } } });
    await prisma.venue.deleteMany({ where: { mayorId: ids.owner } });
    await prisma.user.deleteMany({ where: { id: { in: all } } });
  });

  const setPlace = (placeId: string, who: keyof typeof tokens = "owner") =>
    request(app)
      .put(`/api/v1/event-templates/${template}/place`)
      .set("Authorization", `Bearer ${tokens[who]}`)
      .send({ placeId });

  describe("a package's location", () => {
    it("can be one of the owner's own Places", async () => {
      const res = await setPlace(place);
      expect(res.status).toBe(200);
      expect(res.body.result.place).toMatchObject({
        name: `Garden ${run}`,
        city: "City of Tagaytay",
      });
      expect(res.body.result.place).not.toHaveProperty("addressLine");
    });

    it("can't be someone else's Place", async () => {
      expect((await setPlace(othersPlace)).status).toBe(404);
    });

    it("can't be both: no venue on a package at a Place", async () => {
      await setPlace(place);
      await expect(
        EventTemplateSvc.attachVenue(template, ids.owner, venue),
      ).rejects.toMatchObject(conflict);
    });

    it("can't be both: no Place on a package with a venue", async () => {
      await EventTemplateSvc.attachVenue(template, ids.owner, venue);
      const res = await setPlace(place);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("LOCATION_CONFLICT");
    });

    it("can be taken off again", async () => {
      await setPlace(place);
      const res = await request(app)
        .delete(`/api/v1/event-templates/${template}/place`)
        .set("Authorization", `Bearer ${tokens.owner}`);
      expect(res.status).toBe(200);
      expect(
        (await prisma.eventTemplate.findUnique({ where: { id: template } }))
          ?.placeId,
      ).toBeNull();
    });
  });

  describe("a package at a Place goes through", () => {
    beforeEach(async () => {
      await prisma.eventTemplate.update({
        where: { id: template },
        data: { placeId: place },
      });
    });

    it("review", async () => {
      await EventTemplateSvc.submitTemplate(template, ids.owner);
      expect(
        (await prisma.eventTemplate.findUnique({ where: { id: template } }))
          ?.status,
      ).toBe("pending");
    });

    it("admin approval", async () => {
      await AdminSvc.approveEventTemplate(template);
      expect(
        (await prisma.eventTemplate.findUnique({ where: { id: template } }))
          ?.status,
      ).toBe("published");
    });

    it("an archived Place no longer counts", async () => {
      await prisma.place.update({
        where: { id: place },
        data: { archivedAt: new Date() },
      });
      try {
        await expect(
          EventTemplateSvc.submitTemplate(template, ids.owner),
        ).rejects.toMatchObject({ status: 409, code: "VENUE_REQUIRED" });
      } finally {
        await prisma.place.update({
          where: { id: place },
          data: { archivedAt: null },
        });
      }
    });

    it("a request: the event is held at the same Place", async () => {
      const res = await request(app)
        .post("/api/v1/event-requests")
        .set("Authorization", `Bearer ${tokens.guest}`)
        .send({
          templateId: template,
          name: "Garden party",
          description: "At the garden",
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
        });
      expect(res.status).toBe(201);
      const event = await prisma.event.findUnique({
        where: { id: res.body.data.id },
      });
      expect(event?.placeId).toBe(place);
      expect(await EventRequestRepo.hasVenue(event!.id)).toBe(true);
    });
  });

  describe("an event's address", () => {
    let event = "";

    beforeAll(async () => {
      event = (
        await prisma.event.create({
          data: {
            clientId: ids.guest,
            organizerId: ids.owner,
            placeId: place,
            name: "Garden party",
            description: "At the garden",
            eventCategory: "social",
            startAt,
            endAt,
            guestCount: 4,
            totalAmount: 1000,
          },
        })
      ).id;
    });

    const look = (who: keyof typeof tokens) =>
      request(app)
        .get(`/api/v1/places/event/${event}`)
        .set("Authorization", `Bearer ${tokens[who]}`);

    const booking = (status: "pending" | "confirmed") =>
      prisma.booking.create({
        data: {
          eventId: event,
          userId: ids.guest,
          guestCount: 2,
          totalAmount: 1000,
          status,
          startAt,
          endAt,
          ticketCode: `PLACE-${status}-${run}`,
        },
      });

    it("the Event Owner and an admin see the full address", async () => {
      for (const who of ["owner", "admin"] as const) {
        const res = await look(who);
        expect(res.status, who).toBe(200);
        expect(res.body.data.addressLine, who).toBe("12 Mabini Street");
      }
    });

    it("anyone else sees name and city only", async () => {
      const res = await look("other");
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        type: "place",
        id: place,
        name: `Garden ${run}`,
        city: "City of Tagaytay",
        state: "Cavite",
        country: "Philippines",
      });
    });

    it("a pending guest sees name and city; once confirmed, the address", async () => {
      const pending = await booking("pending");
      expect((await look("guest")).body.data).not.toHaveProperty("addressLine");
      await prisma.booking.update({
        where: { id: pending.id },
        data: { status: "confirmed" },
      });
      expect((await look("guest")).body.data.addressLine).toBe(
        "12 Mabini Street",
      );
    });

    it("the event's own response carries name and city, never the address", async () => {
      const found = await EventRequestRepo.findById(event);
      expect(found?.place).toMatchObject({ name: `Garden ${run}` });
      expect(found?.place).not.toHaveProperty("addressLine");
    });
  });

  it("an account whose Place an event is held at can't be deleted", async () => {
    await prisma.eventTemplate.update({
      where: { id: template },
      data: { placeId: othersPlace },
    });
    await expect(UsersSvc.deleteUser(ids.other)).rejects.toMatchObject({
      status: 409,
      code: "PLACE_IN_USE",
    });
    expect(
      await prisma.user.findUnique({ where: { id: ids.other } }),
    ).not.toBeNull();
    await prisma.eventTemplate.update({
      where: { id: template },
      data: { placeId: null },
    });
  });
});
