import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/utils/prisma";
import { createTestToken } from "./setup";

describe("POST /api/v1/event-templates/:id/submit", () => {
  let ownerId: string;
  let ownerToken: string;
  let otherFoxerId: string;
  let otherFoxerToken: string;
  let draftTemplateId: string;

  const ownerEmail = `submit-owner-${Date.now()}@test.com`;
  const otherEmail = `submit-other-${Date.now()}@test.com`;

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: { email: ownerEmail, password: "pass", name: "Submit Owner" },
    });
    ownerId = owner.id;
    ownerToken = createTestToken(ownerId, ownerEmail, ["eventFoxer"]);

    const otherFoxer = await prisma.user.create({
      data: { email: otherEmail, password: "pass", name: "Other Foxer" },
    });
    otherFoxerId = otherFoxer.id;
    otherFoxerToken = createTestToken(otherFoxerId, otherEmail, ["eventFoxer"]);

    const draftTemplate = await prisma.eventTemplate.create({
      data: {
        name: "Year-end Gala",
        description: "Annual company gala",
        category: "corporate",
        ownerId,
        status: "draft",
      },
    });
    draftTemplateId = draftTemplate.id;
  });

  afterAll(async () => {
    await prisma.eventTemplate.deleteMany({
      where: { ownerId: { in: [ownerId, otherFoxerId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, otherFoxerId] } },
    });
  });

  it("returns 401 when no token is provided", async () => {
    const res = await request(app).post(
      `/api/v1/event-templates/${draftTemplateId}/submit`,
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when a non-owner EventFoxer submits the template", async () => {
    const res = await request(app)
      .post(`/api/v1/event-templates/${draftTemplateId}/submit`)
      .set("Authorization", `Bearer ${otherFoxerToken}`);
    expect(res.status).toBe(403);
  });

  it("sets status to pending when the owner submits a draft template", async () => {
    const res = await request(app)
      .post(`/api/v1/event-templates/${draftTemplateId}/submit`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.template).toHaveProperty("status", "pending");
  });

  it("returns 400 when the template is already submitted (not in draft)", async () => {
    // Template is now "pending" from the previous test
    const res = await request(app)
      .post(`/api/v1/event-templates/${draftTemplateId}/submit`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already submitted|not in draft/i);
  });

  it("returns 404 when the template does not exist", async () => {
    const res = await request(app)
      .post(`/api/v1/event-templates/nonexistent-id-000/submit`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
  });
});
