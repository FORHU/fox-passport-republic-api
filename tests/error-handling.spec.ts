import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import app from "../src/app";
import { asyncHandler } from "../src/utils/async-handler";
import { Prisma } from "@prisma/client";
import { createErrorHandler } from "../src/middleware/error.middleware";
import { AppError, conflict, notFound } from "../src/utils/errors";

describe("asyncHandler", () => {
  it("forwards a rejected promise to next()", async () => {
    const boom = new Error("boom");
    const next = vi.fn();

    asyncHandler(async () => {
      throw boom;
    })({} as never, {} as never, next);
    await new Promise((r) => setImmediate(r));

    expect(next).toHaveBeenCalledWith(boom);
  });

  it("does not call next() when the handler resolves", async () => {
    const next = vi.fn();

    asyncHandler(async () => undefined)({} as never, {} as never, next);
    await new Promise((r) => setImmediate(r));

    expect(next).not.toHaveBeenCalled();
  });
});

describe("createErrorHandler", () => {
  function run(isDev: boolean, err: unknown) {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    createErrorHandler(isDev)(err, {} as never, res as never, vi.fn());
    return {
      status: res.status.mock.calls[0][0],
      body: res.json.mock.calls[0][0],
    };
  }

  it("defaults to 500 and hides the message in production", () => {
    const { status, body } = run(false, new Error("db password is hunter2"));

    expect(status).toBe(500);
    expect(body.message).toBe("Something went wrong");
    expect(body.stack).toBeUndefined();
  });

  it("shows the real message and stack in dev", () => {
    const { status, body } = run(true, new Error("real cause"));

    expect(status).toBe(500);
    expect(body.message).toBe("real cause");
    expect(body.stack).toBeDefined();
  });

  it("honours an explicit status and its message in production", () => {
    const err = Object.assign(new Error("Payload too large"), { status: 413 });
    const { status, body } = run(false, err);

    expect(status).toBe(413);
    expect(body.message).toBe("Payload too large");
  });

  it("returns an AppError's status, message and code", () => {
    const { status, body } = run(false, notFound("Event"));

    expect(status).toBe(404);
    expect(body.message).toBe("Event not found");
    expect(body.code).toBe("NOT_FOUND");
  });

  it("lets an AppError carry its own code", () => {
    const { body } = run(false, conflict("Slot taken", "SLOT_TAKEN"));

    expect(body.code).toBe("SLOT_TAKEN");
  });

  it("hides the message of a 5xx AppError in production", () => {
    const { status, body } = run(false, new AppError("secret detail"));

    expect(status).toBe(500);
    expect(body.message).toBe("Something went wrong");
    expect(body.code).toBe("INTERNAL");
  });

  it("does not add a code to errors that are not AppErrors", () => {
    const err = Object.assign(new Error("Payload too large"), {
      status: 413,
      code: "ECONNRESET",
    });
    const { body } = run(false, err);

    expect(body.code).toBeUndefined();
  });

  it.each([
    ["P2025", 404, "Record not found"],
    ["P2002", 409, "This record already exists"],
  ])(
    "maps Prisma %s to %i without leaking table details",
    (code, expected, msg) => {
      const err = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: ("email")',
        { code, clientVersion: "test" },
      );
      const { status, body } = run(false, err);

      expect(status).toBe(expected);
      expect(body.message).toBe(msg);
      expect(JSON.stringify(body)).not.toContain("email");
    },
  );

  it("treats an unmapped Prisma error as a 500", () => {
    const err = new Prisma.PrismaClientKnownRequestError("connection lost", {
      code: "P1001",
      clientVersion: "test",
    });
    const { status, body } = run(false, err);

    expect(status).toBe(500);
    expect(body.message).toBe("Something went wrong");
  });

  it("copes with a non-Error throw", () => {
    const { status, body } = run(true, "just a string");

    expect(status).toBe(500);
    expect(body.message).toBe("just a string");
  });
});

describe("global error handler", () => {
  it("answers a disallowed CORS origin with 403, not 400/500", async () => {
    const res = await request(app)
      .get("/api/health")
      .set("Origin", "https://not-allowed.example");

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("Not allowed by CORS");
  });

  it("keeps the status body-parser puts on a malformed JSON body", async () => {
    const res = await request(app)
      .post("/api/v1/auth/google/exchange")
      .set("Content-Type", "application/json")
      .send("{not json");

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
