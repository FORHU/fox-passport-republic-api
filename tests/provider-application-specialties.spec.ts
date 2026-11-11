import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

/**
 * RR-3 (api#300) I1 at the apply endpoint: a Provider names at least one
 * catalog specialty with no maximum, and the check runs before any identity
 * document is stored. Venue and Event Foxers keep their limit of 3. The
 * service, file storage and catalog are stubbed; the controller is real.
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
    getProviderSpecialties: vi.fn(async () => [
      { slug: "dj", name: "DJ" },
      { slug: "photography", name: "Photography" },
      { slug: "videography", name: "Videography" },
      { slug: "sound_system", name: "Sound system" },
    ]),
  },
}));

const { default: RoleRequestCtrl } =
  await import("../src/modules/role-request/role-request.controller");

function apply(
  roleType: string,
  data: Record<string, unknown>,
  withFile = false,
) {
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
    body: { roleType, data: JSON.stringify(data) },
    files: withFile
      ? { validId1File: [{ originalname: "id.png" }] }
      : undefined,
  } as unknown as Request;
  return RoleRequestCtrl.apply(req, res as unknown as Response).then(
    () => res as { statusCode: number; body: any },
  );
}

beforeEach(() => vi.clearAllMocks());

describe("Provider application specialties", () => {
  it("accepts more than three, with no maximum", async () => {
    const res = await apply("providerFoxer", {
      specializations: ["dj", "photography", "videography", "sound_system"],
    });
    expect(res.statusCode).toBe(201);
    const data = submitApplication.mock.calls[0][2] as {
      specializations: string[];
    };
    expect(data.specializations).toHaveLength(4);
  });

  it("refuses an application with no specialty", async () => {
    const res = await apply("providerFoxer", {});
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Choose at least one specialty");
    expect(submitApplication).not.toHaveBeenCalled();
  });

  it("refuses an unknown slug and names it", async () => {
    const res = await apply("providerFoxer", {
      specializations: ["dj", "plumbing"],
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Unknown specialty: plumbing");
  });

  it("stores no identity document when the specialties are refused", async () => {
    await apply("providerFoxer", { specializations: [] }, true);
    expect(storePrivateDocument).not.toHaveBeenCalled();
  });

  it("sends each slug once", async () => {
    await apply("providerFoxer", { specializations: ["dj", "dj"] });
    const data = submitApplication.mock.calls[0][2] as {
      specializations: string[];
    };
    expect(data.specializations).toEqual(["dj"]);
  });
});

describe("Venue and Event applications keep their limit of 3", () => {
  it("refuses four specializations from a Venue Foxer", async () => {
    const res = await apply("venueFoxer", {
      specializations: ["indoor", "outdoor", "hotel", "garden"],
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Maximum 3 specializations allowed");
  });

  it("accepts three", async () => {
    const res = await apply("venueFoxer", {
      specializations: ["indoor", "outdoor", "hotel"],
    });
    expect(res.statusCode).toBe(201);
  });
});
