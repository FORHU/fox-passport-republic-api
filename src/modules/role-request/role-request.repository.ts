import { prisma } from "../../utils/prisma";
import { Prisma, RoleType, RequestStatus } from "@prisma/client";

/** A role request no admin has decided yet, which its applicant can withdraw. */
export const OPEN_REQUEST_STATUSES: RequestStatus[] = [
  RequestStatus.pending,
  RequestStatus.revision_requested,
];

export default class RoleRequestRepo {
  /**
   * Create a base role request with associated application data
   */
  static async createRequest(
    userId: string,
    roleType: RoleType,
    applicationData: Record<string, unknown>,
    applicationModel: string,
  ) {
    return prisma.roleRequest.create({
      data: {
        userId,
        roleType,
        [applicationModel]: {
          create: applicationData,
        },
      },
      include: {
        [applicationModel]: true,
      },
    });
  }

  /**
   * Find an open request for a user and role: one still waiting for review,
   * or sent back for document revision (api#367). Either blocks a second
   * application for the same role.
   */
  static async findPendingRequest(userId: string, roleType: RoleType) {
    return prisma.roleRequest.findFirst({
      where: {
        userId,
        roleType,
        status: { in: OPEN_REQUEST_STATUSES },
      },
    });
  }

  /**
   * The applicant withdraws their own open request (api#367). Conditional on
   * the owner and an open status, so an admin decision landing at the same
   * moment wins cleanly: the count is 0 and nothing changes.
   */
  static async withdrawRequest(id: string, userId: string) {
    const { count } = await prisma.roleRequest.updateMany({
      where: { id, userId, status: { in: OPEN_REQUEST_STATUSES } },
      data: {
        status: RequestStatus.withdrawn,
        flaggedDocuments: [],
        revisionNote: null,
      },
    });
    return count;
  }

  static async findRequestStatus(id: string) {
    return prisma.roleRequest.findUnique({
      where: { id },
      select: { id: true, userId: true, roleType: true, status: true },
    });
  }

  /**
   * Get all role requests with their specific application data
   */
  static async getAllRequests(status?: RequestStatus) {
    return prisma.roleRequest.findMany({
      where: status ? { status } : {},
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        venueFoxerApplication: {
          include: {
            validId1: true,
            nbiFile: true,
            tinIdFile: true,
            birPermitFile: true,
            selfieFile: true,
          },
        },
        eventFoxerApplication: {
          include: {
            validId1: true,
            nbiFile: true,
            tinIdFile: true,
            birPermitFile: true,
            selfieFile: true,
            portfolioFile: true,
          },
        },
        providerFoxerApplication: {
          include: {
            validId1: true,
            nbiFile: true,
            tinIdFile: true,
            birPermitFile: true,
            selfieFile: true,
            // The CV behind a claim of more than 30 years (api#423).
            portfolioFile: true,
            // The wizard's per-specialty lines and work photos (api#440).
            specialtyDetails: {
              include: {
                photos: {
                  include: { file: true },
                  orderBy: { position: "asc" },
                },
              },
            },
          },
        },
        investorApplication: { include: { proofOfFunds: true } },
        organizerApplication: {
          include: {
            validId1: true,
            backgroundClearanceFile: true,
            selfieFile: true,
            portfolioFile: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  static async getMyRequests(userId: string) {
    return prisma.roleRequest.findMany({
      where: { userId },
      include: {
        venueFoxerApplication: true,
        eventFoxerApplication: true,
        providerFoxerApplication: { include: { specialtyDetails: true } },
        investorApplication: { include: { proofOfFunds: true } },
        organizerApplication: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Find request by ID
   */
  static async findRequestById(id: string) {
    return prisma.roleRequest.findUnique({
      where: { id },
      include: {
        user: true,
        venueFoxerApplication: {
          include: {
            validId1: true,
            nbiFile: true,
            tinIdFile: true,
            birPermitFile: true,
            selfieFile: true,
          },
        },
        eventFoxerApplication: {
          include: {
            validId1: true,
            nbiFile: true,
            tinIdFile: true,
            birPermitFile: true,
            selfieFile: true,
            portfolioFile: true,
          },
        },
        providerFoxerApplication: {
          include: {
            validId1: true,
            nbiFile: true,
            tinIdFile: true,
            birPermitFile: true,
            selfieFile: true,
            // The CV behind a claim of more than 30 years (api#423).
            portfolioFile: true,
            // The wizard's per-specialty lines and work photos (api#440).
            specialtyDetails: {
              include: {
                photos: {
                  include: { file: true },
                  orderBy: { position: "asc" },
                },
              },
            },
          },
        },
        investorApplication: { include: { proofOfFunds: true } },
        organizerApplication: {
          include: {
            validId1: true,
            backgroundClearanceFile: true,
            selfieFile: true,
            portfolioFile: true,
          },
        },
      },
    });
  }

  /**
   * Update request status. Only a request still pending is decided: one its
   * applicant withdrew a moment earlier (api#367) stays withdrawn, and the
   * answer is null.
   */
  static async updateRequestStatus(
    id: string,
    data: {
      status: RequestStatus;
      reviewedBy: string;
      reviewedAt: Date;
      rejectionReason?: string;
      flaggedDocuments?: string[];
      revisionNote?: string | null;
    },
  ) {
    try {
      return await prisma.roleRequest.update({
        where: { id, status: RequestStatus.pending },
        data,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2025"
      ) {
        return null;
      }
      throw e;
    }
  }

  /**
   * Update the file columns on a request's application row (used when an
   * applicant resubmits just the documents an admin flagged).
   */
  static async updateApplicationFiles(
    applicationModel: string,
    requestId: string,
    fileColumns: Record<string, string>,
  ) {
    const applicationDelegate = prisma[
      applicationModel as keyof typeof prisma
    ] as unknown as {
      update: (args: {
        where: { requestId: string };
        data: Record<string, string>;
      }) => Promise<unknown>;
    };

    return applicationDelegate.update({
      where: { requestId },
      data: fileColumns,
    });
  }

  /**
   * Set the years of experience on a request's application row, when an admin
   * lowers a claim over 30 years or confirms it (api#423).
   */
  static async updateApplicationExperience(
    applicationModel: string,
    requestId: string,
    experience: number | string,
  ) {
    const applicationDelegate = prisma[
      applicationModel as keyof typeof prisma
    ] as unknown as {
      update: (args: {
        where: { requestId: string };
        data: { experience: number | string };
      }) => Promise<unknown>;
    };

    return applicationDelegate.update({
      where: { requestId },
      data: { experience },
    });
  }

  /**
   * Persist the remaining (unresolved) flaggedDocuments after a partial
   * resubmission, reopening the request for review once none are left.
   */
  static async applyResubmission(id: string, remainingFlagged: string[]) {
    const reopened = remainingFlagged.length === 0;
    return prisma.roleRequest.update({
      where: { id },
      data: {
        flaggedDocuments: remainingFlagged,
        ...(reopened
          ? {
              status: RequestStatus.pending,
              rejectionReason: null,
              revisionNote: null,
              reviewedBy: null,
              reviewedAt: null,
            }
          : {}),
      },
    });
  }
}
