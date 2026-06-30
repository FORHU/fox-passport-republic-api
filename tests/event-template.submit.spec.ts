import { expect } from "chai";
import request from "supertest";
import app from "../src/app";
import { describe, it, before, after } from "mocha";
import { prisma } from "../src/utils/prisma";
import jwt from "jsonwebtoken";
import { ACCESS_TOKEN_SECRET } from "../src/config";

describe("POST /api/v1/event-templates/:id/submit", () => {
  let hostUser: any;
  let hostToken: string;
  let otherHostUser: any;
  let otherHostToken: string;
  let draftTemplate: any;

  before(async () => {
    hostUser = await prisma.user.create({
      data: { email: "submithost@example.com", password: "pass", name: "Submit Host" },
    });
    hostToken = jwt.sign(
      { userId: hostUser.id, email: hostUser.email, roleType: ["host"] },
      ACCESS_TOKEN_SECRET,
      { expiresIn: "1h" }
    );

    otherHostUser = await prisma.user.create({
      data: { email: "othersubmithost@example.com", password: "pass", name: "Other Submit Host" },
    });
    otherHostToken = jwt.sign(
      { userId: otherHostUser.id, email: otherHostUser.email, roleType: ["host"] },
      ACCESS_TOKEN_SECRET,
      { expiresIn: "1h" }
    );

    draftTemplate = await prisma.eventTemplate.create({
      data: {
        name: "Year-end Gala",
        description: "Annual company gala",
        category: "corporate",
        ownerId: hostUser.id,
        status: "draft",
      },
    });
  });

  after(async () => {
    await prisma.eventTemplate.deleteMany({
      where: { ownerId: { in: [hostUser.id, otherHostUser.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [hostUser.id, otherHostUser.id] } },
    });
  });

  it("returns 401 when no token is provided", async () => {
    const res = await request(app)
      .post(`/api/v1/event-templates/${draftTemplate.id}/submit`);
    expect(res.status).to.equal(401);
  });

  it("returns 403 when a non-owner host submits the template", async () => {
    const res = await request(app)
      .post(`/api/v1/event-templates/${draftTemplate.id}/submit`)
      .set("Authorization", `Bearer ${otherHostToken}`);
    expect(res.status).to.equal(403);
  });

  it("sets status to pending when owner submits a draft template", async () => {
    const res = await request(app)
      .post(`/api/v1/event-templates/${draftTemplate.id}/submit`)
      .set("Authorization", `Bearer ${hostToken}`);
    expect(res.status).to.equal(200);
    expect(res.body.template).to.have.property("status", "pending");
  });

  it("returns 400 when template is already submitted (not in draft)", async () => {
    // Template is now "pending" from the previous test
    const res = await request(app)
      .post(`/api/v1/event-templates/${draftTemplate.id}/submit`)
      .set("Authorization", `Bearer ${hostToken}`);
    expect(res.status).to.equal(400);
    expect(res.body.message).to.match(/already submitted|not in draft/i);
  });

  it("returns 404 when template does not exist", async () => {
    const res = await request(app)
      .post(`/api/v1/event-templates/nonexistent-id-000/submit`)
      .set("Authorization", `Bearer ${hostToken}`);
    expect(res.status).to.equal(404);
  });
});
