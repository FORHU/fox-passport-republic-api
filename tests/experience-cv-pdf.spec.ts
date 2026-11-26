import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * api#423: the CV behind a claim of more than 30 years must be a PDF, so the
 * admin checking it can read it in the browser. A plain portfolio may still
 * be a Word file. The repositories and database are stubbed; the service is
 * real.
 */

const fileFind = vi.hoisted(() => vi.fn());
const createRequest = vi.hoisted(() => vi.fn());

vi.mock("../src/utils/prisma", () => ({
  prisma: {
    file: {
      findUnique: (...a: unknown[]) => fileFind(...a),
      findMany: vi.fn(async () => []),
      count: vi.fn(
        async ({ where }: { where: { id: { in: string[] } } }) =>
          where.id.in.length,
      ),
    },
  },
}));
vi.mock("../src/modules/users/users.repository", () => ({
  default: { findUserById: vi.fn(async () => ({ roleType: [] })) },
}));
vi.mock("../src/modules/role-request/role-request.repository", () => ({
  default: {
    findPendingRequest: vi.fn(async () => null),
    createRequest: (...a: unknown[]) => createRequest(...a),
  },
}));
vi.mock("../src/modules/notifications/user-notification.service", () => ({
  default: { create: vi.fn() },
}));

const { default: RoleRequestService } =
  await import("../src/modules/role-request/role-request.service");

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

beforeEach(() => {
  fileFind.mockReset();
  createRequest.mockReset().mockResolvedValue({ id: "req-1" });
});

describe("the CV behind a claim of more than 30 years", () => {
  it("must be a PDF", async () => {
    fileFind.mockResolvedValue({ type: DOCX_MIME });
    await expect(
      RoleRequestService.submitApplication("u1", "eventFoxer", {
        experience: "40",
        claimedExperience: 40,
        portfolioFileId: "file-docx",
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "The CV behind more than 30 years of experience must be a PDF",
    });
    expect(createRequest).not.toHaveBeenCalled();
  });

  it("is taken as a PDF", async () => {
    fileFind.mockResolvedValue({ type: "application/pdf" });
    await RoleRequestService.submitApplication("u1", "eventFoxer", {
      experience: "40",
      claimedExperience: 40,
      portfolioFileId: "file-pdf",
    });
    expect(createRequest).toHaveBeenCalled();
  });

  it("leaves a plain portfolio free to be a Word file", async () => {
    fileFind.mockResolvedValue({ type: DOCX_MIME });
    await RoleRequestService.submitApplication("u1", "eventFoxer", {
      experience: "12",
      portfolioFileId: "file-docx",
    });
    expect(createRequest).toHaveBeenCalled();
  });
});
