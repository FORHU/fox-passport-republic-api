import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import apiApp from "../src/app";
import { prisma } from "../src/utils/prisma";

/** Public listings name their owner and carry no contact details (api#498). */
describe("public listing responses", () => {
  const run = Math.random().toString(36).slice(2, 8);
  const email = `owner_${run}@contact.test`;
  const name = `Olive Owner ${run}`;
  const ids = { user: "", venue: "", asset: "", service: "", template: "" };

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: {
        email,
        username: `owner_${run}`,
        password: "pw",
        name,
        roleType: ["venueFoxer", "eventFoxer", "providerFoxer"],
      },
    });
    ids.user = owner.id;
    const listing = {
      name: `Listing ${run}`,
      description: "A listing",
      price: 1000,
      billingRate: "daily" as const,
      status: "available" as const,
    };
    const venue = await prisma.venue.create({
      data: {
        ...listing,
        mayorId: owner.id,
        category: "indoor",
        capacity: 50,
        address: "1 Test Street",
        city: `City ${run}`,
        country: "Philippines",
        lat: 14.6,
        lng: 121,
      },
    });
    ids.venue = venue.id;
    const asset = await prisma.asset.create({
      data: { ...listing, ownerId: owner.id, category: "sound_system" },
    });
    ids.asset = asset.id;
    const service = await prisma.service.create({
      data: { ...listing, ownerId: owner.id, category: "photography" },
    });
    ids.service = service.id;
    const template = await prisma.eventTemplate.create({
      data: {
        ownerId: owner.id,
        name: `Listing ${run}`,
        description: "A package",
        category: "social",
        targetCity: `City ${run}`,
        status: "published",
        isPublic: true,
        templateVenues: { create: { venueId: venue.id } },
        templateAssets: { create: { assetId: asset.id, quantity: 1 } },
        templateServices: { create: { serviceId: service.id } },
      },
    });
    ids.template = template.id;
  });

  afterAll(async () => {
    await prisma.eventTemplate.deleteMany({ where: { id: ids.template } });
    await prisma.venue.deleteMany({ where: { id: ids.venue } });
    await prisma.asset.deleteMany({ where: { id: ids.asset } });
    await prisma.service.deleteMany({ where: { id: ids.service } });
    await prisma.user.deleteMany({ where: { id: ids.user } });
  });

  const get = async (path: string) => {
    const res = await request(apiApp).get(`/api/v1${path}`);
    expect(res.status, path).toBe(200);
    return JSON.stringify(res.body);
  };

  it.each([
    ["venue", () => `/venues/${ids.venue}`],
    ["gear", () => `/asset/${ids.asset}`],
    ["service", () => `/service/${ids.service}`],
    ["package", () => `/event-templates/browse/${ids.template}`],
    ["search", () => `/search?location=${encodeURIComponent(`City ${run}`)}`],
  ])("%s: the owner's name, not their email", async (_kind, path) => {
    const body = await get(path());
    expect(body).toContain(name);
    expect(body).not.toContain(email);
  });

  it.each([
    "/venues",
    "/venues/catalog",
    "/venues/boundaries",
    "/venues/near?lat=14.6&lng=121",
    "/asset",
    "/asset/browse",
    "/service",
    "/service/browse",
    "/event-templates/browse",
    "/event-templates/trending?category=social",
  ])("%s lists no email", async (path) => {
    expect(await get(path)).not.toMatch(/"email":/);
  });
});
