import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * api#367: the queries behind withdrawing a role application and the
 * one-open-application-per-role check. Prisma is stubbed.
 */

const roleRequest = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
}));
vi.mock("../src/utils/prisma", () => ({ prisma: { roleRequest } }));

const { default: RoleRequestRepo } =
  await import("../src/modules/role-request/role-request.repository");

beforeEach(() => vi.clearAllMocks());

describe("withdrawRequest", () => {
  it("only changes the owner's request while it is still open", async () => {
    roleRequest.updateMany.mockResolvedValue({ count: 1 });

    const count = await RoleRequestRepo.withdrawRequest("req-1", "user-1");

    expect(count).toBe(1);
    expect(roleRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: "req-1",
        userId: "user-1",
        status: { in: ["pending", "revision_requested"] },
      },
      data: { status: "withdrawn", flaggedDocuments: [], revisionNote: null },
    });
  });

  it("reports 0 when it was no longer open", async () => {
    roleRequest.updateMany.mockResolvedValue({ count: 0 });

    expect(await RoleRequestRepo.withdrawRequest("req-1", "user-1")).toBe(0);
  });
});

describe("updateRequestStatus (admin review)", () => {
  const decision = {
    status: "approved" as const,
    reviewedBy: "admin-1",
    reviewedAt: new Date("2026-11-26T00:00:00Z"),
  };

  it("only decides a request that is still pending", async () => {
    roleRequest.update.mockResolvedValue({ id: "req-1" });

    await RoleRequestRepo.updateRequestStatus("req-1", decision);

    expect(roleRequest.update).toHaveBeenCalledWith({
      where: { id: "req-1", status: "pending" },
      data: decision,
    });
  });

  it("answers null when the applicant withdrew it first", async () => {
    roleRequest.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Record not found", {
        code: "P2025",
        clientVersion: "test",
      }),
    );

    expect(
      await RoleRequestRepo.updateRequestStatus("req-1", decision),
    ).toBeNull();
  });

  it("passes other database errors on", async () => {
    roleRequest.update.mockRejectedValue(new Error("connection lost"));

    await expect(
      RoleRequestRepo.updateRequestStatus("req-1", decision),
    ).rejects.toThrow("connection lost");
  });
});

describe("findPendingRequest", () => {
  it("counts pending and sent-back requests, not withdrawn ones, as open", async () => {
    roleRequest.findFirst.mockResolvedValue(null);

    await RoleRequestRepo.findPendingRequest("user-1", "eventFoxer");

    expect(roleRequest.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        roleType: "eventFoxer",
        status: { in: ["pending", "revision_requested"] },
      },
    });
  });
});
