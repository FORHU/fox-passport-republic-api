import RoleRequestRepo from "../repositories/role-request.repository";
import UsersRepo from "../repositories/users.repository";
import { RoleType, RequestStatus } from "@prisma/client";
import { prisma } from "../utils/prisma";
import NotificationService from "../modules/notifications/user-notification.service";

export default class RoleRequestService {
  /**
   * Submit an application for a specific role
   */
  static async submitApplication(
    userId: string,
    roleType: RoleType,
    applicationData: any,
  ) {
    // 1. Check if user already has this role
    const user = await UsersRepo.findUserById(userId);
    if (!user) throw new Error("User not found");

    if (user.roleType.includes(roleType)) {
      throw new Error(`User already has the ${roleType} role`);
    }

    // 2. Check for existing pending application for this role
    const pending = await RoleRequestRepo.findPendingRequest(userId, roleType);
    if (pending) {
      throw new Error(
        `An application for the ${roleType} role is already pending`,
      );
    }

    // 3. Map roleType to the correct application model name in Prisma
    const modelMapping: Record<RoleType, string> = {
      [RoleType.venueFoxer]: "venueFoxerApplication",
      [RoleType.eventFoxer]: "eventFoxerApplication",
      [RoleType.gearFoxer]: "gearFoxerApplication",
      [RoleType.serviceFoxer]: "serviceFoxerApplication",
      [RoleType.investor]: "investorApplication",
    };

    // Convert empty strings to null so optional FK fields don't violate constraints
    const cleanedData = Object.fromEntries(
      Object.entries(applicationData).map(([k, v]) => [k, v === "" ? null : v]),
    );

    return RoleRequestRepo.createRequest(
      userId,
      roleType,
      cleanedData,
      modelMapping[roleType],
    );
  }

  /**
   * Admin review of an application
   */
  static async reviewApplication(
    requestId: string,
    adminId: string,
    status: RequestStatus,
    rejectionReason?: string,
  ) {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch request
      const request = await RoleRequestRepo.findRequestById(requestId);
      if (!request) throw new Error("Application not found");
      if (request.status !== RequestStatus.pending) {
        throw new Error("This application has already been processed");
      }

      // 2. Update status
      const updatedRequest = await RoleRequestRepo.updateRequestStatus(
        requestId,
        {
          status,
          reviewedBy: adminId,
          reviewedAt: new Date(),
          rejectionReason:
            status === RequestStatus.rejected ? rejectionReason : undefined,
        },
      );

      // 3. If approved, grant the role and copy declared specializations
      if (status === RequestStatus.approved) {
        await tx.user.update({
          where: { id: request.userId },
          data: { roleType: { push: request.roleType } },
        });

        const appKey = `${request.roleType}Application` as keyof typeof request;
        const app = request[appKey] as any;
        const declared: string[] = app?.specializations ?? [];
        if (declared.length > 0) {
          await tx.foxerSpecialization.createMany({
            data: declared.map((category) => ({
              userId: request.userId,
              roleType: request.roleType,
              category,
              source: "declared",
            })),
            skipDuplicates: true,
          });
        }
      }

      return {
        updatedRequest,
        userId: request.userId,
        roleType: request.roleType,
      };
    });

    console.log("About to create notification for userId:", result.userId);

    await NotificationService.create({
      userId: result.userId,
      type:
        status === RequestStatus.approved
          ? "role_request_approved"
          : "role_request_rejected",
      title:
        status === RequestStatus.approved
          ? "Application approved"
          : "Application rejected",
      message:
        status === RequestStatus.approved
          ? `Your ${result.roleType} application has been approved!`
          : `Your ${result.roleType} application was rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ""}`,
      metadata: { requestId, roleType: result.roleType, status },
    });

    console.log("Notification created successfully");

    return result.updatedRequest;
  }

  /**
   * Get all requests (for admin dashboard)
   */
  static async getRequests(status?: RequestStatus) {
    return RoleRequestRepo.getAllRequests(status);
  }

  static async getMyRequests(userId: string) {
    return RoleRequestRepo.getMyRequests(userId);
  }
}
