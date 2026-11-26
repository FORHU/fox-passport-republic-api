import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../src/app";
import { prisma } from "../src/utils/prisma";
import { createTestToken } from "./setup";
import {
  canSeePlaceAddress,
  placeForViewer,
} from "../src/modules/place/place-view";

/** Places: ownership, reuse and address privacy (epic #517, api#518, api#519). */
describe("places", () => {
  const run = Math.random().toString(36).slice(2, 8);
  const ids = { owner: "", other: "", admin: "", secretary: "" };
  const tokens = { owner: "", other: "", admin: "", secretary: "" };

  const home = {
    name: `Garcia home ${run}`,
    addressLine: "12 Mabini Street, Barangay San Jose",
    city: "City of Tagaytay",
    state: "Cavite",
    country: "Philippines",
    lat: 14.1153,
    lng: 120.9621,
    notes: "Gate code 4521",
  };

  const as = (who: keyof typeof tokens) => ({
    Authorization: `Bearer ${tokens[who]}`,
  });

  beforeAll(async () => {
    const make = async (
      tag: string,
      systemRole: "user" | "admin" | "admin_secretary" = "user",
    ) => {
      const email = `place-${tag}-${run}@test.com`;
      const user = await prisma.user.create({
        data: {
          email,
          username: `place_${tag}_${run}`,
          password: "pw",
          name: `Place ${tag}`,
          systemRole,
        },
      });
      return {
        id: user.id,
        token: createTestToken(user.id, email, [], systemRole),
      };
    };
    for (const [key, role] of [
      ["owner", "user"],
      ["other", "user"],
      ["admin", "admin"],
      ["secretary", "admin_secretary"],
    ] as const) {
      const u = await make(key, role);
      ids[key] = u.id;
      tokens[key] = u.token;
    }
  });

  afterAll(async () => {
    await prisma.place.deleteMany({
      where: { creatorId: { in: Object.values(ids) } },
    });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
  });

  const create = (body: object, who: keyof typeof tokens = "owner") =>
    request(app).post("/api/v1/places").set(as(who)).send(body);

  it("a signed-in person creates a Place and gets the full address back", async () => {
    const res = await create(home);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      type: "place",
      name: home.name,
      city: "City of Tagaytay",
      state: "Cavite",
      addressLine: home.addressLine,
      notes: home.notes,
      archived: false,
    });
  });

  it("needs a signed-in account", async () => {
    const res = await request(app).post("/api/v1/places").send(home);
    expect(res.status).toBe(401);
  });

  it("refuses a Philippine city that isn't in the province", async () => {
    const res = await create({ ...home, city: "Davao City", state: "Cavite" });
    expect(res.status).toBe(400);
    expect(res.body.code ?? res.body.error?.code).toBe("PLACE_ADDRESS");
  });

  it("refuses missing fields and impossible coordinates", async () => {
    expect((await create({ ...home, addressLine: "" })).status).toBe(400);
    expect((await create({ ...home, lat: 120 })).status).toBe(400);
  });

  it("takes an address outside the Philippines as given", async () => {
    const res = await create({
      ...home,
      name: `Tokyo flat ${run}`,
      city: "Shibuya",
      state: "Tokyo",
      country: "Japan",
      lat: 35.66,
      lng: 139.7,
    });
    expect(res.status).toBe(201);
  });

  it("lists only the creator's own live Places, for reuse", async () => {
    await create({ ...home, name: `Someone else ${run}` }, "other");
    const res = await request(app).get("/api/v1/places/mine").set(as("owner"));
    expect(res.status).toBe(200);
    const names = res.body.data.map((p: { name: string }) => p.name);
    expect(names).toContain(home.name);
    expect(names).not.toContain(`Someone else ${run}`);
  });

  it("is private: another person gets not found, an admin and the creator see it", async () => {
    const created = (await create({ ...home, name: `Private ${run}` })).body
      .data;
    const path = `/api/v1/places/${created.id}`;
    expect((await request(app).get(path).set(as("other"))).status).toBe(404);
    for (const who of ["owner", "admin", "secretary"] as const) {
      const res = await request(app).get(path).set(as(who));
      expect(res.status, who).toBe(200);
      expect(res.body.data.addressLine, who).toBe(home.addressLine);
    }
  });

  it("only the creator edits, and a Philippine edit is checked too", async () => {
    const created = (await create({ ...home, name: `Edit ${run}` })).body.data;
    const path = `/api/v1/places/${created.id}`;
    expect(
      (
        await request(app)
          .patch(path)
          .set(as("other"))
          .send({ name: "Mine now" })
      ).status,
    ).toBe(404);
    const ok = await request(app)
      .patch(path)
      .set(as("owner"))
      .send({ notes: "" });
    expect(ok.status).toBe(200);
    expect(ok.body.data.notes).toBeNull();
    const bad = await request(app)
      .patch(path)
      .set(as("owner"))
      .send({ city: "Davao City" });
    expect(bad.status).toBe(400);
  });

  it("archives instead of deleting; an archived Place can't be edited or reused", async () => {
    const created = (await create({ ...home, name: `Archive ${run}` })).body
      .data;
    const path = `/api/v1/places/${created.id}`;
    expect((await request(app).delete(path).set(as("other"))).status).toBe(404);
    const archived = await request(app).delete(path).set(as("owner"));
    expect(archived.status).toBe(200);
    expect(archived.body.data.archived).toBe(true);
    expect(
      await prisma.place.findUnique({ where: { id: created.id } }),
    ).not.toBeNull();
    const mine = await request(app).get("/api/v1/places/mine").set(as("owner"));
    expect(mine.body.data.map((p: { id: string }) => p.id)).not.toContain(
      created.id,
    );
    expect(
      (await request(app).patch(path).set(as("owner")).send({ name: "Back" }))
        .status,
    ).toBe(409);
  });

  describe("who sees the street address", () => {
    const place = {
      id: "p1",
      creatorId: "creator",
      name: "Garcia home",
      city: "City of Tagaytay",
      state: "Cavite",
      country: "Philippines",
      addressLine: "12 Mabini Street",
      lat: 14.1,
      lng: 120.9,
      notes: "Gate code",
      archivedAt: null,
    };
    const person = { userId: "someone", systemRole: "user", roleType: [] };

    it.each([
      ["the creator", { userId: "creator", systemRole: "user" }, {}],
      ["an admin", { userId: "a", systemRole: "admin" }, {}],
      [
        "an admin secretary",
        { userId: "s", systemRole: "admin_secretary" },
        {},
      ],
      ["a confirmed guest", person, { confirmedGuest: true }],
      ["the Event Owner", person, { eventOwner: true }],
      ["an Event Coordinator", person, { eventCoordinator: true }],
      ["an accepted Supplier", person, { acceptedSupplier: true }],
    ])("%s sees it", (_who, viewer, access) => {
      expect(canSeePlaceAddress(viewer, place, access)).toBe(true);
      expect(placeForViewer(viewer, place, access)).toHaveProperty(
        "addressLine",
      );
    });

    it.each([
      ["someone signed out", null],
      ["another signed-in person", person],
    ])("%s gets name and city only", (_who, viewer) => {
      const shown = placeForViewer(viewer, place);
      expect(shown).toEqual({
        type: "place",
        id: "p1",
        name: "Garcia home",
        city: "City of Tagaytay",
        state: "Cavite",
        country: "Philippines",
      });
    });

    it("a pending guest is not a confirmed one", () => {
      expect(canSeePlaceAddress(person, place, { confirmedGuest: false })).toBe(
        false,
      );
    });
  });
});
