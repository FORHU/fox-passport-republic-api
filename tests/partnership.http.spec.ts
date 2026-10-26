import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { signTestSession } from "./helpers/test-session";
import { prisma } from "../src/utils/prisma";
import app from "../src/app";

/**
 * Proposing a partnership over HTTP: the body is validated before Prisma sees
 * it, failures answer in plain sentences, and reads are signed-in and scoped.
 * The bug this guards: the web form sent `proposedBenefits` as `{ text }`, the
 * column is `String?`, and the 400 carried Prisma's own message, naming the
 * model and every column, straight into the user's toast.
 */
describe("Partnership proposals: HTTP layer", () => {
  const runId = Math.random().toString(36).substring(7);
  let investor: { id: string; email: string };
  let stranger: { id: string; email: string };
  let mayor: { id: string; email: string };
  let venueId: string;
  let investorToken: string;
  let strangerToken: string;
  const createdProposalIds: string[] = [];

  const base = () => ({
    targetVenueId: venueId,
    partnershipType: "investment",
    title: "Stage Sponsorship",
    description: "Fund the main stage build for the season.",
    proposedAmount: 50000,
  });

  beforeAll(async () => {
    investor = await prisma.user.create({
      data: {
        email: `http_partner_${runId}@test.com`,
        username: `http_partner_${runId}`,
        password: "pw",
        roleType: ["investor"],
        name: "Partner",
      },
    });
    stranger = await prisma.user.create({
      data: {
        email: `http_stranger_${runId}@test.com`,
        username: `http_stranger_${runId}`,
        password: "pw",
        roleType: [],
        name: "Stranger",
      },
    });
    mayor = await prisma.user.create({
      data: {
        email: `http_mayor_${runId}@test.com`,
        username: `http_mayor_${runId}`,
        password: "pw",
        roleType: ["venueFoxer"],
        name: "Mayor",
      },
    });
    const venue = await prisma.venue.create({
      data: {
        name: `HTTP Venue ${runId}`,
        mayorId: mayor.id,
        address: "1 Test Street",
        city: "Test City",
        country: "Test Country",
        description: "A venue for the partnership HTTP spec",
        category: "convention_center",
        capacity: 100,
        price: 1000,
        billingRate: "hourly",
      },
    });
    venueId = venue.id;

    investorToken = signTestSession({
      userId: investor.id,
      email: investor.email,
      systemRole: "user",
      roleType: ["investor"],
    });
    strangerToken = signTestSession({
      userId: stranger.id,
      email: stranger.email,
      systemRole: "user",
      roleType: [],
    });
  });

  afterAll(async () => {
    await prisma.partnershipProposal.deleteMany({
      where: { partnerId: investor.id },
    });
    await prisma.venue.deleteMany({ where: { id: venueId } });
    await prisma.user.deleteMany({
      where: { id: { in: [investor.id, stranger.id, mayor.id] } },
    });
  });

  it("rejects benefits sent as an object with a plain message, not Prisma's", async () => {
    const res = await request(app)
      .post("/api/v1/partnerships/proposals")
      .set("Authorization", `Bearer ${investorToken}`)
      .send({ ...base(), proposedBenefits: { text: "Logo on the stage" } });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      message: "Proposed benefits must be text.",
    });
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/prisma/i);
    expect(raw).not.toContain("partnershipProposal");
  });

  it("rejects an amount too large for the column before it reaches the database", async () => {
    const res = await request(app)
      .post("/api/v1/partnerships/proposals")
      .set("Authorization", `Bearer ${investorToken}`)
      .send({ ...base(), proposedAmount: 1e13 });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(
      "The amount can't be more than 9,999,999,999.99.",
    );
    expect(JSON.stringify(res.body)).not.toMatch(/prisma/i);
  });

  it("rejects a partnership type the database doesn't have", async () => {
    const res = await request(app)
      .post("/api/v1/partnerships/proposals")
      .set("Authorization", `Bearer ${investorToken}`)
      .send({ ...base(), partnershipType: "resource" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Choose a partnership type.");
  });

  it("rejects an empty target with a plain message, not Joi's", async () => {
    const res = await request(app)
      .post("/api/v1/partnerships/proposals")
      .set("Authorization", `Bearer ${investorToken}`)
      .send({ ...base(), targetVenueId: "" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(
      "Choose one event or one venue to propose to.",
    );
  });

  it("saves a valid proposal with text benefits", async () => {
    const res = await request(app)
      .post("/api/v1/partnerships/proposals")
      .set("Authorization", `Bearer ${investorToken}`)
      .send({
        ...base(),
        partnershipType: "resource_contribution",
        proposedBenefits: "Logo on the stage backdrop and 4 VIP passes",
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      partnershipType: "resource_contribution",
      proposedBenefits: "Logo on the stage backdrop and 4 VIP passes",
      targetVenueId: venueId,
    });
    createdProposalIds.push(res.body.data.id);
  });

  it("needs a signed-in user to list proposals", async () => {
    const res = await request(app).get("/api/v1/partnerships/proposals");
    expect(res.status).toBe(401);
  });

  it("lists only the viewer's own proposals", async () => {
    const mine = await request(app)
      .get("/api/v1/partnerships/proposals")
      .set("Authorization", `Bearer ${investorToken}`);
    expect(mine.status).toBe(200);
    expect(mine.body.data.map((p: { id: string }) => p.id)).toEqual(
      expect.arrayContaining(createdProposalIds),
    );

    const theirs = await request(app)
      .get("/api/v1/partnerships/proposals")
      .set("Authorization", `Bearer ${strangerToken}`);
    expect(theirs.status).toBe(200);
    expect(theirs.body.data).toEqual([]);

    const one = await request(app)
      .get(`/api/v1/partnerships/proposals/${createdProposalIds[0]}`)
      .set("Authorization", `Bearer ${strangerToken}`);
    expect(one.status).toBe(404);
  });
});
