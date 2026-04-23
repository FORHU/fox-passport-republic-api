import RoleRequestRepo from "../repositories/role-request.repository";
import UsersRepo from "../repositories/users.repository";
import { RoleType, RequestStatus } from "@prisma/client";
import { prisma } from "../utils/prisma";

export default class RoleRequestService {
  /**
   * Submit an application for a specific role
   */
  static async submitApplication(userId: string, roleType: RoleType, applicationData: any) {
    // 1. Check if user already has this role
    const user = await UsersRepo.findUserById(userId);
    if (!user) throw new Error("User not found");
    
    if (user.roleType.includes(roleType)) {
      throw new Error(`User already has the ${roleType} role`);
    }

    // 2. Check for existing pending application for this role
    const pending = await RoleRequestRepo.findPendingRequest(userId, roleType);
    if (pending) {
      throw new Error(`An application for the ${roleType} role is already pending`);
    }

    // 3. Map roleType to the correct application model name in Prisma
    const modelMapping: Record<RoleType, string> = {
      [RoleType.mayor]: "mayorApplication",
      [RoleType.host]: "hostApplication",
      [RoleType.foxerAsset]: "foxerAssetApplication",
      [RoleType.foxerService]: "foxerServiceApplication",
      [RoleType.investor]: "investorApplication",
    };

    return RoleRequestRepo.createRequest(userId, roleType, applicationData, modelMapping[roleType]);
  }

  /**
   * Admin review of an application
   */
  static async reviewApplication(
    requestId: string,
    adminId: string,
    status: RequestStatus,
    rejectionReason?: string
  ) {
    return prisma.$transaction(async (tx) => {
      // 1. Fetch request
      const request = await RoleRequestRepo.findRequestById(requestId);
      if (!request) throw new Error("Application not found");
      if (request.status !== RequestStatus.pending) {
        throw new Error("This application has already been processed");
      }

      // 2. Update status
      const updatedRequest = await RoleRequestRepo.updateRequestStatus(requestId, {
        status,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        rejectionReason: status === RequestStatus.rejected ? rejectionReason : undefined,
      });

      // 3. If approved, grant the role
      if (status === RequestStatus.accepted) {
        await tx.user.update({
          where: { id: request.userId },
          data: {
            roleType: {
              push: request.roleType,
            },
          },
        });
      }

      return updatedRequest;
    });
  }

  /**
   * Get all requests (for admin dashboard)
   */
  static async getRequests(status?: RequestStatus) {
    return RoleRequestRepo.getAllRequests(status);
  }
}
