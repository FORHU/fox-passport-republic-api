import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../src/app";
import { prisma } from "../src/utils/prisma";
import AdminSvc from "../src/modules/admin/admin.service";
import EventRequestRepo from "../src/modules/event-request/event-request.repository";
import EventTemplateSvc from "../src/modules/event-template/event-template.service";
import MatchSvc from "../src/modules/match/match.service";
import PassportSvc from "../src/modules/passport/passport.service";
import { createTestToken } from "./setup";

/** Every event has a venue (epic api#477, api#481). */
describe("a package and an event need a venue", () => {
  const run = Math.random().toString(36).slice(2, 8);
  const email = `venue-rule-${run}@test.com`;
  let owner = "";
  let token = "";
  let venue = "";
  let closed = "";
  let template = "";

  const required = { status: 409, code: "VENUE_REQUIRED" };
  const DAY = 86_400_000;
  const startAt = new Date(Date.now() + 30 * DAY);
  const endAt = new Date(startAt.getTime() + DAY / 4);

  const makeVenue = async (status: "available" | "archived") =>
    (
      await prisma.venue.create({
        data: {
          mayorId: owner,
          category: "indoor",
          name: `Rule Hall ${status} ${run}`,
          description: "A hall",
          capacity: 100,
          price: 1000,
          billingRate: "daily",
          address: "1 Test Street",
          city: "Manila",
          country: "Philippines",
          status,
        },
      })
    ).id;

  const addLine = (venueId: string) =>
    prisma.eventTemplateVenue.create({
      data: {
        templateId: template,
        venueId,
        matched: true,
        matchRequestStatus: "accepted",
      },
    });

  const publish = () =>
    prisma.eventTemplate.update({
      where: { id: template },
      data: { status: "published", isPublic: true },
    });

  const makeEvent = async () =>
    (
      await prisma.event.create({
        data: {
          clientId: owner,
          organizerId: owner,
          name: "Rule night",
          description: "A night",
          eventCategory: "social",
          startAt,
          endAt,
          guestCount: 10,
          totalAmount: 1000,
        },
      })
    ).id;

  const makeBooking = async (eventId: string) =>
    (
      await prisma.booking.create({
        data: {
          eventId,
          userId: owner,
          guestCount: 2,
          totalAmount: 1000,
          status: "completed",
          startAt,
          endAt,
          ticketCode: `RULE-${Math.random().toString(36).slice(2, 10)}`,
        },
      })
    ).id;

  const lineFor = (eventId: string, over: object = {}) =>
    prisma.eventVenueTransaction.create({
      data: {
        eventId,
        venueId: venue,
        providerId: owner,
        agreedPrice: 1000,
        status: "approved",
        ...over,
      },
    });

  const packageNow = () =>
    prisma.eventTemplate.findUnique({ where: { id: template } });

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email,
        username: `venue_rule_${run}`,
        password: "pw",
        name: "Rule Owner",
        roleType: ["eventFoxer", "venueFoxer"],
      },
    });
    owner = user.id;
    token = createTestToken(owner, email, ["eventFoxer", "venueFoxer"]);
    venue = await makeVenue("available");
    closed = await makeVenue("archived");
  });

  beforeEach(async () => {
    const t = await prisma.eventTemplate.create({
      data: {
        ownerId: owner,
        name: `Rule package ${run}`,
        description: "A package",
        category: "social",
        targetCity: "Manila",
        targetCountry: "Philippines",
      },
    });
    template = t.id;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: owner } });
    await prisma.passportStamp.deleteMany({
      where: { booking: { userId: owner } },
    });
    await prisma.eventVenueTransaction.deleteMany({
      where: { providerId: owner },
    });
    await prisma.booking.deleteMany({ where: { userId: owner } });
    await prisma.event.deleteMany({ where: { organizerId: owner } });
    await prisma.eventTemplate.deleteMany({ where: { ownerId: owner } });
    await prisma.venue.deleteMany({ where: { mayorId: owner } });
    await prisma.user.deleteMany({ where: { id: owner } });
  });

  describe("sending a package for review", () => {
    const submit = () => EventTemplateSvc.submitTemplate(template, owner);

    it("is refused with no venue", async () => {
      await expect(submit()).rejects.toMatchObject(required);
    });

    it("is refused with a venue that isn't taking bookings", async () => {
      await addLine(closed);
      await expect(submit()).rejects.toMatchObject(required);
    });

    it("waits for the venue even when its line says optional", async () => {
      const l = await addLine(venue);
      await prisma.eventTemplateVenue.update({
        where: { id: l.id },
        data: { isOptional: true, matchRequestStatus: "pending" },
      });
      await expect(submit()).rejects.toMatchObject({
        code: "SUPPLIERS_NOT_READY",
      });
    });

    it("goes with one", async () => {
      await addLine(venue);
      expect((await submit()).status).toBe("pending");
    });
  });

  describe("publishing", () => {
    it("is refused with no venue", async () => {
      await expect(
        AdminSvc.approveEventTemplate(template),
      ).rejects.toMatchObject(required);
      expect(await packageNow()).toMatchObject({
        status: "draft",
        isPublic: false,
      });
    });

    it("works with one", async () => {
      await addLine(venue);
      await AdminSvc.approveEventTemplate(template);
      expect(await packageNow()).toMatchObject({
        status: "published",
        isPublic: true,
      });
    });

    it("isn't the owner's to do: a draft stays private", async () => {
      await EventTemplateSvc.updateTemplate({
        id: template,
        ownerId: owner,
        data: { isPublic: true },
      });
      const made = await EventTemplateSvc.createTemplate({
        ownerId: owner,
        name: "Public at birth",
        category: "social",
        isPublic: true,
      });
      const rows = await prisma.eventTemplate.findMany({
        where: { id: { in: [template, made.id] } },
      });
      expect(rows.map((r) => r.isPublic)).toEqual([false, false]);
    });
  });

  describe("the venue's line", () => {
    it("is never optional", async () => {
      const line = await EventTemplateSvc.attachVenue(
        template,
        owner,
        venue,
        undefined,
        undefined,
        undefined,
        undefined,
        true,
      );
      expect(line.isOptional).toBe(false);
      await expect(
        EventTemplateSvc.setLineOptional(template, owner, "venue", venue, true),
      ).rejects.toMatchObject(required);
    });

    it("leaving a live package takes it offline", async () => {
      await addLine(venue);
      await publish();
      const out = await EventTemplateSvc.removeVenue(template, owner, venue);
      expect(out.reopened).toBe(true);
      expect(await packageNow()).toMatchObject({
        status: "draft",
        isPublic: false,
      });
    });

    it("leaving one of two keeps it live", async () => {
      await addLine(venue);
      await addLine(closed);
      await publish();
      const out = await EventTemplateSvc.removeVenue(template, owner, closed);
      expect(out.reopened).toBe(false);
      expect(await packageNow()).toMatchObject({ status: "published" });
    });
  });

  describe("booking a package", () => {
    const book = (body: object = {}) =>
      request(app)
        .post("/api/v1/bookings/from-template")
        .set("Authorization", `Bearer ${token}`)
        .send({
          templateId: template,
          guestCount: 2,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          ...body,
        });

    it("is refused with no venue, and makes no event", async () => {
      await publish();
      const res = await book();
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("VENUE_REQUIRED");
      expect(
        await prisma.event.count({ where: { templateId: template } }),
      ).toBe(0);
    });

    it("is refused when the venue is left out", async () => {
      const line = await addLine(venue);
      await publish();
      const res = await book({ excludedVenueIds: [line.id] });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("VENUE_REQUIRED");
    });

    it("is refused for a draft someone marked public", async () => {
      await addLine(venue);
      await prisma.eventTemplate.update({
        where: { id: template },
        data: { isPublic: true },
      });
      expect((await book()).status).toBe(404);
    });
  });

  describe("requesting an event", () => {
    const ask = (body: object) =>
      request(app)
        .post("/api/v1/event-requests")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "Rule request",
          description: "A request",
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          ...body,
        });

    it("is refused for a venue alone, or a package with none", async () => {
      for (const body of [{ venueId: venue }, { templateId: template }]) {
        const res = await ask(body);
        expect(res.status).toBe(409);
        expect(res.body.code).toBe("VENUE_REQUIRED");
      }
    });

    it("works for a package with one", async () => {
      await addLine(venue);
      const res = await ask({ templateId: template });
      expect(res.status).toBe(201);
      expect(await EventRequestRepo.hasVenue(res.body.data.id)).toBe(true);
    });

    it("can't be accepted with no venue", async () => {
      const id = await makeEvent();
      await expect(MatchSvc.acceptMatch(id, owner)).rejects.toMatchObject(
        required,
      );
      await lineFor(id);
      await MatchSvc.acceptMatch(id, owner);
      const e = await prisma.event.findUnique({ where: { id } });
      expect(e?.requestStatus).toBe("approved");
    });
  });

  describe("an event's venue", () => {
    it("is a live line: not a declined or left-out one", async () => {
      const id = await makeEvent();
      expect(await EventRequestRepo.hasVenue(id)).toBe(false);
      await lineFor(id, { status: "rejected" });
      await lineFor(id, { included: false });
      expect(await EventRequestRepo.hasVenue(id)).toBe(false);
      await lineFor(id, { status: "pending" });
      expect(await EventRequestRepo.hasVenue(id)).toBe(true);
    });
  });

  describe("a stamp", () => {
    const stampOf = (bookingId: string) =>
      prisma.passportStamp.findUnique({ where: { bookingId } });

    it("names the booking's venue", async () => {
      const id = await makeEvent();
      const bookingId = await makeBooking(id);
      await lineFor(id, { bookingId });
      await PassportSvc.issueStamp(bookingId);
      expect((await stampOf(bookingId))?.venueId).toBe(venue);
    });

    it("names the event's venue when no booking carries it", async () => {
      const id = await makeEvent();
      const bookingId = await makeBooking(id);
      await lineFor(id);
      await PassportSvc.issueStamp(bookingId);
      expect((await stampOf(bookingId))?.venueId).toBe(venue);
    });

    it("isn't given for an event with none", async () => {
      const bookingId = await makeBooking(await makeEvent());
      await PassportSvc.issueStamp(bookingId);
      expect(await stampOf(bookingId)).toBeNull();
    });
  });
});
