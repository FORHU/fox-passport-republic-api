import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../src/app";
import { prisma } from "../src/utils/prisma";
import { createTestToken } from "./setup";

/** Location changes once booked (decision A10, api#521). */
describe("changing where an event at a Place is held", () => {
  const run = Math.random().toString(36).slice(2, 8);
  const ids = { owner: "", guest: "", other: "", client: "" };
  const tokens = { owner: "", guest: "", other: "", client: "" };
  const places = {
    garden: "",
    hall: "",
    makati: "",
    spare: "",
    clientHome: "",
    others: "",
  };
  let event = "";

  const DAY = 86_400_000;
  const startAt = new Date(Date.now() + 30 * DAY);
  const endAt = new Date(startAt.getTime() + DAY / 4);

  const as = (who: keyof typeof tokens) => ({
    Authorization: `Bearer ${tokens[who]}`,
  });

  const makePlace = async (
    creatorId: string,
    name: string,
    city: string,
    state: string,
  ) =>
    (
      await prisma.place.create({
        data: {
          creatorId,
          name: `${name} ${run}`,
          addressLine: `${name} street`,
          city,
          state,
          lat: 14.1,
          lng: 120.9,
        },
      })
    ).id;

  const makeEvent = (placeId: string, clientId = ids.client) =>
    prisma.event.create({
      data: {
        clientId,
        organizerId: ids.owner,
        placeId,
        name: `Garden party ${run}`,
        description: "At the garden",
        eventCategory: "social",
        startAt,
        endAt,
        guestCount: 4,
        totalAmount: 1000,
      },
    });

  const book = (
    eventId: string,
    status: "pending" | "confirmed",
    tag: string,
  ) =>
    prisma.booking.create({
      data: {
        eventId,
        userId: ids.guest,
        guestCount: 2,
        totalAmount: 1000,
        status,
        startAt,
        endAt,
        ticketCode: `LOC-${tag}-${run}`,
      },
    });

  const move = (
    eventId: string,
    placeId: string,
    who: keyof typeof tokens = "owner",
  ) =>
    request(app)
      .post(`/api/v1/places/event/${eventId}/location`)
      .set(as(who))
      .send({ placeId, reason: "The garden is flooded" });

  beforeAll(async () => {
    for (const key of Object.keys(ids) as (keyof typeof ids)[]) {
      const email = `loc-${key}-${run}@test.com`;
      const roleType =
        key === "owner" ? (["eventFoxer"] as const) : ([] as const);
      const user = await prisma.user.create({
        data: {
          email,
          username: `loc_${key}_${run}`,
          password: "pw",
          name: `Loc ${key}`,
          roleType: [...roleType],
        },
      });
      ids[key] = user.id;
      tokens[key] = createTestToken(user.id, email, [...roleType]);
    }
    places.garden = await makePlace(
      ids.owner,
      "Garden",
      "City of Tagaytay",
      "Cavite",
    );
    places.hall = await makePlace(
      ids.owner,
      "Hall",
      "City of Tagaytay",
      "Cavite",
    );
    places.makati = await makePlace(
      ids.owner,
      "Rooftop",
      "City of Makati",
      "Metro Manila",
    );
    places.spare = await makePlace(
      ids.owner,
      "Spare",
      "City of Tagaytay",
      "Cavite",
    );
    places.clientHome = await makePlace(
      ids.client,
      "Client home",
      "City of Tagaytay",
      "Cavite",
    );
    places.others = await makePlace(
      ids.other,
      "Stranger home",
      "City of Tagaytay",
      "Cavite",
    );
    event = (await makeEvent(places.garden)).id;
    await book(event, "confirmed", "main");
  });

  afterAll(async () => {
    const all = Object.values(ids);
    await prisma.notification.deleteMany({ where: { userId: { in: all } } });
    await prisma.booking.deleteMany({ where: { userId: { in: all } } });
    await prisma.event.deleteMany({ where: { organizerId: ids.owner } });
    await prisma.place.deleteMany({ where: { creatorId: { in: all } } });
    await prisma.user.deleteMany({ where: { id: { in: all } } });
  });

  it("a Place with a confirmed booking can't be edited in place", async () => {
    const res = await request(app)
      .patch(`/api/v1/places/${places.garden}`)
      .set(as("owner"))
      .send({ addressLine: "Somewhere else" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PLACE_LOCKED");
  });

  it("a Place with only pending bookings is still edited freely", async () => {
    const pendingEvent = await makeEvent(places.spare);
    await book(pendingEvent.id, "pending", "pending");
    const res = await request(app)
      .patch(`/api/v1/places/${places.spare}`)
      .set(as("owner"))
      .send({ notes: "Ring the bell" });
    expect(res.status).toBe(200);
  });

  it("only the Event Owner or a coordinator can change it", async () => {
    expect((await move(event, places.hall, "other")).status).toBe(403);
    expect((await move(event, places.hall, "guest")).status).toBe(403);
  });

  it("can't move to a stranger's Place", async () => {
    expect((await move(event, places.others)).status).toBe(404);
  });

  it("a move in the same city is recorded and the guest is told", async () => {
    const res = await move(event, places.hall);
    expect(res.status).toBe(200);
    expect(res.body.data.guestsNotified).toBe(1);
    expect(res.body.data.change).toMatchObject({
      material: false,
      reason: "The garden is flooded",
    });
    expect(
      (await prisma.event.findUnique({ where: { id: event } }))?.placeId,
    ).toBe(places.hall);
    const change = await prisma.eventLocationChange.findFirst({
      where: { eventId: event },
    });
    expect(change?.fromSnapshot).toMatchObject({
      name: `Garden ${run}`,
      addressLine: "Garden street",
    });
    expect(
      await prisma.notification.count({
        where: { userId: ids.guest, type: "EVENT_LOCATION_CHANGED" },
      }),
    ).toBe(1);
  });

  it("the client's own home is allowed", async () => {
    const res = await move(event, places.clientHome);
    expect(res.status).toBe(200);
    expect(res.body.data.change.material).toBe(false);
  });

  it("another city is material; the guest acknowledges it, once", async () => {
    const res = await move(event, places.makati);
    expect(res.status).toBe(200);
    expect(res.body.data.change.material).toBe(true);
    const changeId = res.body.data.change.id;
    const ack = () =>
      request(app).post(
        `/api/v1/places/location-changes/${changeId}/acknowledge`,
      );
    expect((await ack().set(as("guest"))).status).toBe(200);
    expect((await ack().set(as("guest"))).status).toBe(200);
    expect(
      await prisma.eventLocationAcknowledgement.count({ where: { changeId } }),
    ).toBe(1);
    expect((await ack().set(as("other"))).status).toBe(404);
  });

  it("the history is for people taking part; it keeps every step", async () => {
    const mine = await request(app)
      .get(`/api/v1/places/event/${event}/location-changes`)
      .set(as("guest"));
    expect(mine.status).toBe(200);
    expect(mine.body.data).toHaveLength(3);
    expect(
      (
        await request(app)
          .get(`/api/v1/places/event/${event}/location-changes`)
          .set(as("other"))
      ).status,
    ).toBe(404);
  });

  it("never after the event has started", async () => {
    await prisma.event.update({
      where: { id: event },
      data: { eventStatus: "ongoing" },
    });
    const res = await move(event, places.hall);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("LOCATION_LOCKED");
  });
});
