import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * api#423: an admin settles a claim of more than 30 years. "base" lowers the
 * experience to 30 (the CV and references don't bear it out), "claimed"
 * restores the claim. The repository is stubbed; the service is real.
 */

const findRequestById = vi.fn();
const updateRequestStatus = vi.fn();
const updateApplicationExperience = vi.fn();

vi.mock("../src/utils/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        user: { update: vi.fn() },
        foxerSpecialization: { createMany: vi.fn() },
      }),
  },
}));
vi.mock("../src/modules/users/users.repository", () => ({ default: {} }));
vi.mock("../src/modules/role-request/role-request.repository", () => ({
  default: {
    findRequestById: (...a: unknown[]) => findRequestById(...a),
    updateRequestStatus: (...a: unknown[]) => updateRequestStatus(...a),
    updateApplicationExperience: (...a: unknown[]) =>
      updateApplicationExperience(...a),
  },
}));
vi.mock("../src/modules/notifications/user-notification.service", () => ({
  default: { create: vi.fn() },
}));

import RoleRequestService from "../src/modules/role-request/role-request.service";

const request = (
  roleType: string,
  claimedExperience: number | null,
  experience: number | string,
) => ({
  id: "req-1",
  userId: "user-1",
  roleType,
  status: "pending",
  user: { roleType: [] },
  [`${roleType}Application`]: { claimedExperience, experience },
});

beforeEach(() => {
  findRequestById.mockReset();
  updateApplicationExperience.mockReset();
  updateRequestStatus.mockReset().mockResolvedValue({ id: "req-1" });
});

describe("settling a claim of more than 30 years", () => {
  it("lowers a Provider's claim to 30 and flags the CV", async () => {
    findRequestById.mockResolvedValue(request("providerFoxer", 42, 42));

    await RoleRequestService.reviewApplication(
      "req-1",
      "admin-1",
      "revision_requested",
      undefined,
      ["portfolioFile"],
      "Two of the references could not be reached.",
      "base",
    );

    expect(updateApplicationExperience).toHaveBeenCalledWith(
      "providerFoxerApplication",
      "req-1",
      30,
    );
    expect(updateRequestStatus).toHaveBeenCalledWith(
      "req-1",
      expect.objectContaining({
        status: "revision_requested",
        flaggedDocuments: ["portfolioFile"],
        revisionNote: "Two of the references could not be reached.",
      }),
    );
  });

  it("stores an Event Foxer's lowered experience as text", async () => {
    findRequestById.mockResolvedValue(request("eventFoxer", 42, "42"));

    await RoleRequestService.reviewApplication(
      "req-1",
      "admin-1",
      "revision_requested",
      undefined,
      ["portfolioFile"],
      "The CV doesn't list dates.",
      "base",
    );

    expect(updateApplicationExperience).toHaveBeenCalledWith(
      "eventFoxerApplication",
      "req-1",
      "30",
    );
  });

  it("restores the claim when the admin confirms it", async () => {
    // Lowered to 30 on a first review, then the CV was re-uploaded.
    findRequestById.mockResolvedValue(request("organizer", 42, 30));

    await RoleRequestService.reviewApplication(
      "req-1",
      "admin-1",
      "approved",
      undefined,
      undefined,
      undefined,
      "claimed",
    );

    expect(updateApplicationExperience).toHaveBeenCalledWith(
      "organizerApplication",
      "req-1",
      42,
    );
  });

  it("refuses a decision on an application with no claim", async () => {
    findRequestById.mockResolvedValue(request("providerFoxer", null, 12));

    await expect(
      RoleRequestService.reviewApplication(
        "req-1",
        "admin-1",
        "approved",
        undefined,
        undefined,
        undefined,
        "base",
      ),
    ).rejects.toThrow("doesn't claim more than 30 years");
    expect(updateApplicationExperience).not.toHaveBeenCalled();
    expect(updateRequestStatus).not.toHaveBeenCalled();
  });

  it("leaves experience alone when no decision is sent", async () => {
    findRequestById.mockResolvedValue(request("providerFoxer", 42, 42));

    await RoleRequestService.reviewApplication("req-1", "admin-1", "approved");

    expect(updateApplicationExperience).not.toHaveBeenCalled();
  });
});
