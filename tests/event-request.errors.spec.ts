import { describe, it, expect, afterEach } from "vitest";
import { Prisma } from "@prisma/client";
import { AppError, sendFailure } from "../src/utils/errors";
import EventRequestCtrl from "../src/modules/event-request/event-request.controller";
import EventTemplateRepo from "../src/modules/event-template/event-template.repository";

/**
 * A request for an event whose template is gone, and any failure in this
 * module, must answer with a clear status and a safe message: never Prisma's
 * own text, and not a bare 400 for something that does not exist.
 */

function fakeRes() {
  return {
    statusCode: 0,
    payload: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(p: unknown) {
      this.payload = p;
      return this;
    },
  };
}

describe("sendFailure", () => {
  it("answers an AppError with its own status, message and code", () => {
    const res = fakeRes();
    sendFailure(res as never, new AppError("Gone", 404), 400, {
      success: true,
    });
    expect(res.statusCode).toBe(404);
    expect(res.payload).toEqual({
      success: false,
      message: "Gone",
      code: "NOT_FOUND",
    });
  });

  it("answers a Prisma error with a safe message, not Prisma's text", () => {
    const res = fakeRes();
    sendFailure(
      res as never,
      new Prisma.PrismaClientKnownRequestError(
        "Invalid `prisma.event.create()` invocation: model Event column x",
        { code: "P2025", clientVersion: "test" },
      ),
      400,
    );
    expect(res.statusCode).toBe(404);
    expect(JSON.stringify(res.payload)).not.toMatch(/prisma|invocation|model/i);
  });

  it("keeps a plain message and the status the route gave", () => {
    const res = fakeRes();
    sendFailure(res as never, new Error("Request not found"), 400);
    expect(res.statusCode).toBe(400);
    expect(res.payload).toEqual({ message: "Request not found" });
  });
});

describe("requesting an event from a template that no longer exists", () => {
  const original = EventTemplateRepo.findTemplateById;
  afterEach(() => {
    EventTemplateRepo.findTemplateById = original;
  });

  it("is a 404 naming the event template", async () => {
    EventTemplateRepo.findTemplateById = (async () =>
      null) as typeof EventTemplateRepo.findTemplateById;
    const res = fakeRes();
    const req = {
      user: { userId: "u1" },
      body: {
        templateId: "gone",
        name: "Birthday",
        description: "A party",
        startAt: "2030-01-01T10:00:00Z",
        endAt: "2030-01-01T12:00:00Z",
        guestCount: 10,
      },
    };
    await EventRequestCtrl.spawnRequest(req as never, res as never);
    expect(res.statusCode).toBe(404);
    expect(res.payload).toMatchObject({
      success: false,
      message: "Event template not found",
    });
  });
});
