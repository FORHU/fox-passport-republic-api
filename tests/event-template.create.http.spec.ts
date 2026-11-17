import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { Prisma } from "@prisma/client";
import { signTestSession } from "./helpers/test-session";

/**
 * api#353: POST /event-templates with a title and category but no description
 * (the Event Studio's Save Draft) must save the draft. The validator allows a
 * missing description and the column is required, so the service stores it
 * empty. A Prisma failure answers with a mapped message, never Prisma's own
 * text, which the Studio showed as a toast. The repository is stubbed: the
 * route, guard, validation, controller and service are real.
 */

const repo = vi.hoisted(() => ({
  createTemplate: vi.fn(async (data: Record<string, unknown>) => ({
    id: "t-new",
    ...data,
    owner: { id: data.ownerId, commissionPct: 10 },
    images: [],
  })),
}));
vi.mock("../src/modules/event-template/event-template.repository", () => ({
  default: repo,
}));
vi.mock("../src/infrastructure/socket/invalidate", () => ({
  announceAdminQueueChanged: vi.fn(),
}));

const { default: app } = await import("../src/app");
const { default: EventTemplateSvc } = await import(
  "../src/modules/event-template/event-template.service"
);

const bearer = `Bearer ${signTestSession({
  userId: "foxer-1",
  email: "foxer@test.local",
  roleType: ["eventFoxer"],
})}`;

beforeEach(() => {
  vi.clearAllMocks();
  // Pricing reads other tables; it is not what these cases check.
  vi.spyOn(EventTemplateSvc, "withBreakdownForDisplay").mockImplementation(
    async (t) => t as never,
  );
});

describe("POST /api/v1/event-templates", () => {
  it("saves a draft without a description, stored empty", async () => {
    const res = await request(app)
      .post("/api/v1/event-templates")
      .set("Authorization", bearer)
      .send({ name: "Untitled social", category: "social", isPublic: false });

    expect(res.status).toBe(201);
    expect(repo.createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "foxer-1",
        name: "Untitled social",
        description: "",
        category: "social",
      }),
    );
    expect(res.body.template.description).toBe("");
  });

  it("saves a description of only spaces as empty, not a 400", async () => {
    const res = await request(app)
      .post("/api/v1/event-templates")
      .set("Authorization", bearer)
      .send({ name: "Untitled", description: "   ", category: "social" });

    expect(res.status).toBe(201);
    expect(repo.createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ description: "" }),
    );
  });

  it("keeps a description that was given", async () => {
    const res = await request(app)
      .post("/api/v1/event-templates")
      .set("Authorization", bearer)
      .send({ name: "Gala", description: "Annual gala", category: "corporate" });

    expect(res.status).toBe(201);
    expect(repo.createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Annual gala" }),
    );
  });

  it("answers a Prisma failure without Prisma's message", async () => {
    repo.createTemplate.mockRejectedValueOnce(
      new Prisma.PrismaClientValidationError(
        "Invalid `prisma.eventTemplate.create()` invocation: Argument `description` is missing.",
        { clientVersion: "test" },
      ),
    );

    const res = await request(app)
      .post("/api/v1/event-templates")
      .set("Authorization", bearer)
      .send({ name: "Untitled", category: "social" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("The request was not valid.");
    expect(JSON.stringify(res.body)).not.toMatch(/prisma/i);
  });
});
