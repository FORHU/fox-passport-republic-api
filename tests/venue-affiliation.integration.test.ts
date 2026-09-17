import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/utils/prisma";
import EventTemplateSvc from "../src/modules/event-template/event-template.service";

describe("Venue affiliation gating on EventTemplateSvc.attachVenue", () => {
  let mayorId: string;
  let ownerOrganizerId: string; // owns the venue itself
  let affiliatedOrganizerId: string; // approved affiliation
  let pendingOrganizerId: string; // pending only
  let unaffiliatedOrganizerId: string; // no relationship at all
  let noCalendarPermOrganizerId: string; // approved but missing template:attach

  let venueId: string;
  let templateIds: string[] = [];
  let userIds: string[] = [];

  beforeAll(async () => {
    const runId = Math.random().toString(36).substring(7);

    const mayor = await prisma.user.create({
      data: {
        email: `mayor_${runId}@test.com`,
        password: "pw",
        name: "Venue Mayor",
        roleType: ["venueFoxer"],
      },
    });
    mayorId = mayor.id;

    const makeOrganizer = async (label: string) => {
      const u = await prisma.user.create({
        data: {
          email: `${label}_${runId}@test.com`,
          password: "pw",
          name: label,
          roleType: ["eventFoxer"],
        },
      });
      return u.id;
    };

    ownerOrganizerId = mayorId; // the mayor also organizes their own template
    affiliatedOrganizerId = await makeOrganizer("affiliated");
    pendingOrganizerId = await makeOrganizer("pending");
    unaffiliatedOrganizerId = await makeOrganizer("unaffiliated");
    noCalendarPermOrganizerId = await makeOrganizer("nopermission");

    userIds = [
      affiliatedOrganizerId,
      pendingOrganizerId,
      unaffiliatedOrganizerId,
      noCalendarPermOrganizerId,
    ];

    const venue = await prisma.venue.create({
      data: {
        mayorId,
        category: "hall",
        name: "Test Hall",
        description: "desc",
        capacity: 100,
        price: 5000,
        billingRate: "daily",
        address: "123 Test St",
        city: "Testville",
        country: "Philippines",
        status: "available",
      },
    });
    venueId = venue.id;

    await prisma.venueEventFoxerAffiliation.createMany({
      data: [
        {
          venueId,
          eventFoxerId: affiliatedOrganizerId,
          initiatedBy: "eventFoxer",
          status: "approved",
          permissions: ["template:attach", "calendar:block"],
          agreedPrice: 3000,
        },
        {
          venueId,
          eventFoxerId: pendingOrganizerId,
          initiatedBy: "eventFoxer",
          status: "pending",
        },
        {
          venueId,
          eventFoxerId: noCalendarPermOrganizerId,
          initiatedBy: "venueFoxer",
          status: "approved",
          permissions: ["calendar:block"], // no template:attach
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.eventTemplateVenue.deleteMany({
      where: { templateId: { in: templateIds } },
    });
    await prisma.eventTemplate.deleteMany({
      where: { id: { in: templateIds } },
    });
    await prisma.venueEventFoxerAffiliation.deleteMany({
      where: { venueId },
    });
    await prisma.venue.delete({ where: { id: venueId } });
    await prisma.user.deleteMany({
      where: { id: { in: [...userIds, mayorId] } },
    });
  });

  async function makeTemplate(ownerId: string) {
    const template = await prisma.eventTemplate.create({
      data: {
        ownerId,
        name: "Affiliation Test Template",
        description: "desc",
        category: "corporate",
      },
    });
    templateIds.push(template.id);
    return template.id;
  }

  it("lets the venue's own mayor attach it to their own template", async () => {
    const templateId = await makeTemplate(ownerOrganizerId);
    const result = await EventTemplateSvc.attachVenue(
      templateId,
      ownerOrganizerId,
      venueId,
    );
    expect(result).toBeDefined();
  });

  it("rejects an organizer with no affiliation at all", async () => {
    const templateId = await makeTemplate(unaffiliatedOrganizerId);
    await expect(
      EventTemplateSvc.attachVenue(templateId, unaffiliatedOrganizerId, venueId),
    ).rejects.toThrow(/approved affiliation/);
  });

  it("rejects an organizer whose affiliation is still pending", async () => {
    const templateId = await makeTemplate(pendingOrganizerId);
    await expect(
      EventTemplateSvc.attachVenue(templateId, pendingOrganizerId, venueId),
    ).rejects.toThrow(/approved affiliation/);
  });

  it("rejects an approved affiliation that lacks the template:attach permission", async () => {
    const templateId = await makeTemplate(noCalendarPermOrganizerId);
    await expect(
      EventTemplateSvc.attachVenue(templateId, noCalendarPermOrganizerId, venueId),
    ).rejects.toThrow(/approved affiliation/);
  });

  it("lets an approved, permitted affiliate attach the venue and uses the affiliation's agreed price", async () => {
    const templateId = await makeTemplate(affiliatedOrganizerId);
    const result: any = await EventTemplateSvc.attachVenue(
      templateId,
      affiliatedOrganizerId,
      venueId,
    );
    expect(result.agreedPrice.toNumber()).toBe(3000); // affiliation.agreedPrice, not venue.price (5000)
  });

  it("still honors an explicit agreedPrice override even when affiliated", async () => {
    const templateId = await makeTemplate(affiliatedOrganizerId);
    const result: any = await EventTemplateSvc.attachVenue(
      templateId,
      affiliatedOrganizerId,
      venueId,
      undefined,
      undefined,
      undefined,
      1234,
    );
    expect(result.agreedPrice.toNumber()).toBe(1234);
  });
});
