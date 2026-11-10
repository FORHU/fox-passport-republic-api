import { describe, it, expect, vi, beforeEach } from "vitest";

const userUpdate = vi.fn();
const findRequestById = vi.fn();
const updateRequestStatus = vi.fn();

vi.mock("../src/utils/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        user: { update: (...a: unknown[]) => userUpdate(...a) },
        foxerSpecialization: { createMany: vi.fn() },
      }),
  },
}));
vi.mock("../src/modules/users/users.repository", () => ({ default: {} }));
vi.mock("../src/modules/role-request/role-request.repository", () => ({
  default: {
    findRequestById: (...a: unknown[]) => findRequestById(...a),
    updateRequestStatus: (...a: unknown[]) => updateRequestStatus(...a),
  },
}));
vi.mock("../src/modules/notifications/user-notification.service", () => ({
  default: { create: vi.fn() },
}));

import RoleRequestService from "../src/modules/role-request/role-request.service";

/**
 * After the legacy supply roles were folded into providerFoxer, one person can
 * have two open providerFoxer applications (say, a gear one and a talent one).
 * Approving both must grant the role once.
 */
describe("approving an application", () => {
  beforeEach(() => {
    userUpdate.mockReset();
    findRequestById.mockReset();
    updateRequestStatus.mockReset().mockResolvedValue({ id: "req-1" });
  });

  const request = (held: string[]) => ({
    id: "req-1",
    userId: "user-1",
    roleType: "providerFoxer",
    status: "pending",
    user: { roleType: held },
    providerFoxerApplication: null,
  });

  it("grants the role when it is not held yet", async () => {
    findRequestById.mockResolvedValue(request(["venueFoxer"]));
    await RoleRequestService.reviewApplication("req-1", "admin-1", "approved");
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { roleType: { push: "providerFoxer" } },
    });
  });

  it("does not list the role twice when it is already held", async () => {
    findRequestById.mockResolvedValue(request(["providerFoxer"]));
    await RoleRequestService.reviewApplication("req-1", "admin-1", "approved");
    expect(userUpdate).not.toHaveBeenCalled();
    expect(updateRequestStatus).toHaveBeenCalled();
  });
});
