import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

/**
 * api#367: an applicant withdraws their own role application while no admin
 * has decided it. The repository is stubbed; the controller and service are
 * real, so the status codes are the ones a client sees.
 */

const repo = vi.hoisted(() => ({
  findRequestStatus: vi.fn(),
  withdrawRequest: vi.fn(),
  findPendingRequest: vi.fn(),
  createRequest: vi.fn(),
}));
vi.mock("../src/modules/role-request/role-request.repository", () => ({
  default: repo,
  OPEN_REQUEST_STATUSES: ["pending", "revision_requested"],
}));
const findUserById = vi.hoisted(() => vi.fn());
vi.mock("../src/modules/users/users.repository", () => ({
  default: { findUserById },
}));
vi.mock("../src/utils/prisma", () => ({ prisma: {} }));
vi.mock("../src/modules/notifications/user-notification.service", () => ({
  default: { create: vi.fn() },
}));
vi.mock("../src/modules/file/file.service", () => ({ default: {} }));
vi.mock("../src/modules/users/provider-specialty.service", () => ({
  default: {},
}));
vi.mock("../src/utils/private-files", () => ({
  signPrivateFiles: (v: unknown) => v,
}));
const announceAdminQueueChanged = vi.hoisted(() => vi.fn());
vi.mock("../src/infrastructure/socket/invalidate", () => ({
  announceAdminQueueChanged,
  announceToUser: vi.fn(),
}));
vi.mock("../src/modules/category/category.repository", () => ({
  default: { getProviderSpecialties: vi.fn(async () => []) },
}));

const { default: RoleRequestCtrl } =
  await import("../src/modules/role-request/role-request.controller");
const { default: RoleRequestService } =
  await import("../src/modules/role-request/role-request.service");

type Result = { statusCode: number; body: any };

async function withdraw(id: string, userId = "user-1"): Promise<Result> {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  await RoleRequestCtrl.withdraw(
    { user: { userId }, params: { id } } as unknown as Request,
    res as unknown as Response,
  );
  return res as Result;
}

const request = (status: string, userId = "user-1") => ({
  id: "req-1",
  userId,
  roleType: "eventFoxer",
  status,
});

beforeEach(() => {
  vi.clearAllMocks();
  repo.withdrawRequest.mockResolvedValue(1);
});

describe("PATCH /role-requests/:id/withdraw", () => {
  it("withdraws the applicant's own pending application", async () => {
    repo.findRequestStatus.mockResolvedValue(request("pending"));

    const res = await withdraw("req-1");

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual({
      id: "req-1",
      roleType: "eventFoxer",
      status: "withdrawn",
    });
    expect(repo.withdrawRequest).toHaveBeenCalledWith("req-1", "user-1");
    expect(announceAdminQueueChanged).toHaveBeenCalledTimes(1);
  });

  it("withdraws one sent back for document revision", async () => {
    repo.findRequestStatus.mockResolvedValue(request("revision_requested"));

    const res = await withdraw("req-1");

    expect(res.statusCode).toBe(200);
    expect(repo.withdrawRequest).toHaveBeenCalledWith("req-1", "user-1");
  });

  it("answers someone else's application as not found", async () => {
    repo.findRequestStatus.mockResolvedValue(request("pending", "user-2"));

    const res = await withdraw("req-1");

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Application not found");
    expect(repo.withdrawRequest).not.toHaveBeenCalled();
    expect(announceAdminQueueChanged).not.toHaveBeenCalled();
  });

  it("answers a missing application as not found", async () => {
    repo.findRequestStatus.mockResolvedValue(null);

    const res = await withdraw("nope");

    expect(res.statusCode).toBe(404);
    expect(repo.withdrawRequest).not.toHaveBeenCalled();
  });

  it.each(["approved", "rejected", "withdrawn"])(
    "refuses one already %s with 400",
    async (status) => {
      repo.findRequestStatus.mockResolvedValue(request(status));

      const res = await withdraw("req-1");

      expect(res.statusCode).toBe(400);
      expect(res.body).toMatchObject({
        success: false,
        code: "APPLICATION_DECIDED",
        message: `This application was already ${status} and can't be withdrawn`,
      });
      expect(repo.withdrawRequest).not.toHaveBeenCalled();
      expect(announceAdminQueueChanged).not.toHaveBeenCalled();
    },
  );

  it("refuses with 400 when an admin decided it in between", async () => {
    repo.findRequestStatus.mockResolvedValue(request("pending"));
    repo.withdrawRequest.mockResolvedValue(0);

    const res = await withdraw("req-1");

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe("APPLICATION_DECIDED");
    expect(announceAdminQueueChanged).not.toHaveBeenCalled();
  });

  it("answers 401 without a session", async () => {
    const res = await withdraw("req-1", "");

    expect(res.statusCode).toBe(401);
    expect(repo.findRequestStatus).not.toHaveBeenCalled();
  });
});

describe("Applying again for the same role", () => {
  beforeEach(() => {
    findUserById.mockResolvedValue({ id: "user-1", roleType: [] });
  });

  it("refuses while one is sent back for document revision", async () => {
    repo.findPendingRequest.mockResolvedValue(request("revision_requested"));

    await expect(
      RoleRequestService.submitApplication("user-1", "eventFoxer" as any, {}),
    ).rejects.toThrow(
      "Your application for the eventFoxer role was sent back for document fixes",
    );
    expect(repo.createRequest).not.toHaveBeenCalled();
  });

  it("still refuses while one is pending", async () => {
    repo.findPendingRequest.mockResolvedValue(request("pending"));

    await expect(
      RoleRequestService.submitApplication("user-1", "eventFoxer" as any, {}),
    ).rejects.toThrow(
      "An application for the eventFoxer role is already pending",
    );
  });
});
