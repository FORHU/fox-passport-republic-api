import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";

/**
 * api#366: POST /role-requests/apply checks each role's required fields before
 * any document is stored, stores a left-out list column as [], and never
 * answers with Prisma's text. The service and file storage are stubbed; the
 * controller is real.
 */

const submitApplication = vi.hoisted(() =>
  vi.fn(async (_userId: string, _roleType: string, data: object) => ({
    id: "app-1",
    data,
  })),
);
vi.mock("../src/modules/role-request/role-request.service", () => ({
  default: { submitApplication },
  retiredRoleError: () => null,
}));
const storePrivateDocument = vi.hoisted(() =>
  vi.fn(async () => ({ id: "file-1" })),
);
vi.mock("../src/modules/file/file.service", () => ({
  default: { storePrivateDocument },
}));
vi.mock("../src/utils/private-files", () => ({
  signPrivateFiles: (v: unknown) => v,
}));
vi.mock("../src/infrastructure/socket/invalidate", () => ({
  announceAdminQueueChanged: vi.fn(),
  announceToUser: vi.fn(),
}));
vi.mock("../src/modules/category/category.repository", () => ({
  default: {
    getProviderSpecialties: vi.fn(async () => [{ slug: "dj", name: "DJ" }]),
  },
}));

const { default: RoleRequestCtrl } =
  await import("../src/modules/role-request/role-request.controller");

type Result = { statusCode: number; body: any };

function apply(
  roleType: string,
  data: unknown,
  opts: {
    withFile?: boolean;
    raw?: boolean;
    files?: Record<string, object[]>;
  } = {},
): Promise<Result> {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  const req = {
    user: { userId: "u1" },
    body: { roleType, data: opts.raw ? data : JSON.stringify(data) },
    files:
      opts.files ??
      (opts.withFile ? { validId1: [{ originalname: "id.png" }] } : undefined),
  } as unknown as Request;
  return RoleRequestCtrl.apply(req, res as unknown as Response).then(
    () => res as Result,
  );
}

const venue = {
  businessName: "Fox Hall",
  contactNumber: "0917 123 4567",
  address: "1 Main St",
  tinNumber: "123-456-789-000",
};

const submitted = () =>
  submitApplication.mock.calls[0]?.[2] as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("Left-out specializations are stored as []", () => {
  it("Venue Foxer", async () => {
    const { statusCode } = await apply("venueFoxer", venue);

    expect(statusCode).toBe(201);
    expect(submitted().specializations).toEqual([]);
  });

  it("Event Foxer", async () => {
    const { statusCode } = await apply("eventFoxer", { bio: "Hi" });

    expect(statusCode).toBe(201);
    expect(submitted().specializations).toEqual([]);
  });

  it("Organizer", async () => {
    const { statusCode } = await apply("organizer", {
      bio: "Ran weddings",
      location: "Cebu",
      experience: 3,
      specializations: null,
      validId1FileId: "f1",
      backgroundClearanceFileId: "f2",
      selfieFileId: "f3",
    });

    expect(statusCode).toBe(201);
    expect(submitted().specializations).toEqual([]);
  });

  it("an Investor's interests", async () => {
    const { statusCode } = await apply("investor", { investmentRange: 5000 });

    expect(statusCode).toBe(201);
    expect(submitted().interests).toEqual([]);
  });

  it("keeps the specializations that were sent", async () => {
    await apply("venueFoxer", { ...venue, specializations: ["hotel"] });

    expect(submitted().specializations).toEqual(["hotel"]);
  });
});

describe("Required fields are checked before any document is stored", () => {
  it("lists every missing Venue Foxer field", async () => {
    const { statusCode, body } = await apply(
      "venueFoxer",
      { contactNumber: "0917 123 4567", businessName: "  " },
      { withFile: true },
    );

    expect(statusCode).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe("VALIDATION");
    expect(body.fields).toEqual([
      { field: "businessName", message: "Business name is required." },
      { field: "address", message: "Address is required." },
      { field: "tinNumber", message: "TIN Number is required." },
    ]);
    expect(storePrivateDocument).not.toHaveBeenCalled();
    expect(submitApplication).not.toHaveBeenCalled();
  });

  it("refuses specializations that are not a list", async () => {
    const { statusCode, body } = await apply("venueFoxer", {
      ...venue,
      specializations: "hotel",
    });

    expect(statusCode).toBe(400);
    expect(body.message).toBe("Specializations must be a list.");
    expect(submitApplication).not.toHaveBeenCalled();
  });

  it("requires an Investor's investment range as a number", async () => {
    const missing = await apply("investor", { interests: ["tech"] });
    const text = await apply("investor", { investmentRange: "lots" });

    expect(missing.statusCode).toBe(400);
    expect(missing.body.message).toBe("Investment range is required.");
    expect(text.statusCode).toBe(400);
    expect(text.body.message).toBe("Investment range must be a number.");
    expect(submitApplication).not.toHaveBeenCalled();
  });

  it("answers unreadable application details plainly", async () => {
    const { statusCode, body } = await apply("eventFoxer", "{not json", {
      raw: true,
    });

    expect(statusCode).toBe(400);
    expect(body.message).toBe("The application details could not be read.");
    expect(submitApplication).not.toHaveBeenCalled();
  });
});

describe("Failures never echo Prisma's text", () => {
  it("answers an unexpected database error with a logged 500", async () => {
    submitApplication.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError(
        "Invalid `prisma.roleRequest.create()` invocation: Null constraint violation on the fields: (`specializations`)",
        { code: "P2011", clientVersion: "test" },
      ),
    );

    const { statusCode, body } = await apply("eventFoxer", {});

    expect(statusCode).toBe(500);
    expect(body.success).toBe(false);
    expect(body.code).toBe("INTERNAL");
    expect(console.error).toHaveBeenCalled();
  });

  it("answers a query Prisma refused with a fixed 400", async () => {
    submitApplication.mockRejectedValueOnce(
      new Prisma.PrismaClientValidationError(
        "Invalid `prisma.roleRequest.create()` invocation: Argument `x` is missing.",
        { clientVersion: "test" },
      ),
    );

    const { statusCode, body } = await apply("eventFoxer", {});

    expect(statusCode).toBe(400);
    expect(body.message).toBe("The request was not valid.");
    expect(body.message).not.toContain("prisma");
  });

  it("keeps the service's own message for the applicant", async () => {
    submitApplication.mockRejectedValueOnce(
      new Error("An application for the eventFoxer role is already pending"),
    );

    const { statusCode, body } = await apply("eventFoxer", {});

    expect(statusCode).toBe(400);
    expect(body).toEqual({
      success: false,
      message: "An application for the eventFoxer role is already pending",
    });
  });
});

describe("Portfolio links and files (app#371)", () => {
  it("refuses an Event Foxer link that isn't a web address, before storing anything", async () => {
    const res = await apply(
      "eventFoxer",
      { specializations: ["wedding"], portfolioUrls: ["javascript:alert(1)"] },
      { withFile: true },
    );
    expect(res.statusCode).toBe(400);
    expect(storePrivateDocument).not.toHaveBeenCalled();
    expect(submitApplication).not.toHaveBeenCalled();
  });

  it("stores an Event Foxer's links trimmed", async () => {
    const res = await apply("eventFoxer", {
      specializations: ["wedding"],
      portfolioUrls: [" https://behance.net/fox ", ""],
    });
    expect(res.statusCode).toBe(201);
    expect(submitted().portfolioUrls).toEqual(["https://behance.net/fox"]);
  });

  it("checks a Provider's links too", async () => {
    const res = await apply("providerFoxer", {
      specializations: ["dj"],
      portfolioUrls: ["portfolio"],
    });
    expect(res.statusCode).toBe(400);
    expect(submitApplication).not.toHaveBeenCalled();
  });

  it("stores a multipart portfolio as a portfolio, and IDs as documents", async () => {
    const res = await apply(
      "eventFoxer",
      { specializations: ["wedding"] },
      {
        files: {
          validId1: [{ originalname: "id.png" }],
          portfolioFile: [{ originalname: "cv.pdf" }],
        },
      },
    );
    expect(res.statusCode).toBe(201);
    const purposes = Object.fromEntries(
      storePrivateDocument.mock.calls.map((c) => {
        const [, file, purpose] = c as unknown as [
          string,
          { originalname: string },
          string,
        ];
        return [file.originalname, purpose];
      }),
    );
    expect(purposes).toEqual({ "id.png": "document", "cv.pdf": "portfolio" });
    expect(submitted().portfolioFileId).toBe("file-1");
  });
});
