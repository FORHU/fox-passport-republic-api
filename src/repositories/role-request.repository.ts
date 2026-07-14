import { prisma } from "../utils/prisma";
import { RoleType, RequestStatus } from "@prisma/client";

export default class RoleRequestRepo {
  /**
   * Create a base role request with associated application data
   */
  static async createRequest(
    userId: string,
    roleType: RoleType,
    applicationData: any,
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
   * Find a pending request for a user and role
   */
  static async findPendingRequest(userId: string, roleType: RoleType) {
    return prisma.roleRequest.findFirst({
      where: {
        userId,
        roleType,
        status: RequestStatus.pending,
      },
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
        gearFoxerApplication: {
          include: {
            validId1: true,
            nbiFile: true,
            tinIdFile: true,
            birPermitFile: true,
            selfieFile: true,
          },
        },
        serviceFoxerApplication: {
          include: {
            validId1: true,
            nbiFile: true,
            tinIdFile: true,
            birPermitFile: true,
            selfieFile: true,
          },
        },
        investorApplication: true,
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
        gearFoxerApplication: true,
        serviceFoxerApplication: true,
        investorApplication: true,
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
        gearFoxerApplication: {
          include: {
            validId1: true,
            nbiFile: true,
            tinIdFile: true,
            birPermitFile: true,
            selfieFile: true,
          },
        },
        serviceFoxerApplication: {
          include: {
            validId1: true,
            nbiFile: true,
            tinIdFile: true,
            birPermitFile: true,
            selfieFile: true,
          },
        },
        investorApplication: true,
      },
    });
  }

  /**
   * Update request status
   */
  static async updateRequestStatus(
    id: string,
    data: {
      status: RequestStatus;
      reviewedBy: string;
      reviewedAt: Date;
      rejectionReason?: string;
    },
  ) {
    return prisma.roleRequest.update({
      where: { id },
      data,
    });
  }
}
