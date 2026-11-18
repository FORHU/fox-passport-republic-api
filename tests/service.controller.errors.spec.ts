import { describe, it, expect, afterEach } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * A failed service request must not hand Prisma's own error text (the call, the
 * model, its columns) to the client. The service layer's own plain-Error
 * messages ("Service not found") still reach it, with the status the route
 * gave.
 */

import ServiceCtrl from "../src/modules/service/service.controller";
import ServiceSvc from "../src/modules/service/service.service";

// Swapped by hand and put back, so the test does not depend on module mocking.
const original = ServiceSvc.createService;
function failWith(error: unknown) {
  ServiceSvc.createService = (async () => {
    throw error;
  }) as typeof ServiceSvc.createService;
}

const body = {
  category: "photography",
  name: "Portraits",
  description: "Studio and outdoor portraits",
  city: "Manila",
  country: "Philippines",
  price: 1500,
  imgIds: ["no-such-image"],
};

function call() {
  const res = {
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
  const req = { body, user: { userId: "u1", roleType: ["providerFoxer"] } };
  return {
    res,
    run: () => ServiceCtrl.createService(req as never, res as never),
  };
}

describe("ServiceCtrl.createService errors", () => {
  afterEach(() => {
    ServiceSvc.createService = original;
  });

  it("answers an unknown image id with a safe message, not Prisma's text", async () => {
    failWith(
      new Prisma.PrismaClientKnownRequestError(
        "Invalid `prisma.service.create()` invocation: An operation failed because it depends on one or more records that were required but not found. Expected 1 records to be connected, found only 0. model Service imgIds",
        { code: "P2025", clientVersion: "test" },
      ),
    );
    const { res, run } = call();
    await run();
    expect(res.statusCode).toBe(404);
    const message = (res.payload as { message: string }).message;
    expect(message).toBe("Record not found");
    expect(message).not.toMatch(/prisma|invocation|model/i);
  });

  it("keeps a plain service message and its status", async () => {
    failWith(new Error("Service not found"));
    const { res, run } = call();
    await run();
    expect(res.statusCode).toBe(400);
    expect(res.payload).toEqual({ message: "Service not found" });
  });
});
