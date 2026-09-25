import RoleRequestRepo from "./role-request.repository";
import UsersRepo from "../users/users.repository";
import { RoleType, RequestStatus } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import NotificationService from "../notifications/user-notification.service";

/**
 * Provider-specific application payload. Each RoleType supplies a different
 * set of fields, so this stays an open record validated at the route layer.
 */
export type RoleApplicationData = Record<string, unknown> & {
  specializations?: string[];
};

// Maps roleType -> the Prisma application model name nested under a RoleRequest.
const APPLICATION_MODEL_BY_ROLE: Record<RoleType, string> = {
  [RoleType.venueFoxer]: "venueFoxerApplication",
  [RoleType.eventFoxer]: "eventFoxerApplication",
  [RoleType.gearFoxer]: "gearFoxerApplication",
  [RoleType.serviceFoxer]: "serviceFoxerApplication",
  [RoleType.performerFoxer]: "performerFoxerApplication",
  [RoleType.investor]: "investorApplication",
  [RoleType.organizer]: "organizerApplication",
};

// Maps the document field names admins flag (and applicants resubmit) to the
// application row's file FK column. Mirrors RoleRequestController's
// FILE_FIELD_TO_DB_COLUMN, which the initial /apply upload uses.
const DOCUMENT_FIELD_TO_DB_COLUMN: Record<string, string> = {
  validId1: "validId1FileId",
  nbiFile: "nbiFileId",
  tinIdFile: "tinIdFileId",
  birPermitFile: "birPermitFileId",
  selfieFile: "selfieFileId",
  portfolioFile: "portfolioFileId",
  backgroundClearanceFile: "backgroundClearanceFileId", // organizer only
};

export default class RoleRequestService {
  /**
   * Submit an application for a specific role
   */
  static async submitApplication(
    userId: string,
    roleType: RoleType,
    applicationData: RoleApplicationData,
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

    // Convert empty strings to null so optional FK fields don't violate constraints
    const cleanedData = Object.fromEntries(
      Object.entries(applicationData).map(([k, v]) => [k, v === "" ? null : v]),
    );

    return RoleRequestRepo.createRequest(
      userId,
      roleType,
      cleanedData,
      APPLICATION_MODEL_BY_ROLE[roleType],
    );
  }

  /**
   * Admin review of an application. `revision_requested` is a softer
   * rejection: `flaggedDocuments` names which uploads are the problem (keys
   * matching DOCUMENT_FIELD_TO_DB_COLUMN) and `revisionNote` explains why —
   * everything else on the application stands, and the applicant fixes just
   * those documents via resubmitDocuments instead of reapplying from scratch.
   */
  static async reviewApplication(
    requestId: string,
    adminId: string,
    status: RequestStatus,
    rejectionReason?: string,
    flaggedDocuments?: string[],
    revisionNote?: string,
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
          flaggedDocuments:
            status === RequestStatus.revision_requested
              ? (flaggedDocuments ?? [])
              : [],
          revisionNote:
            status === RequestStatus.revision_requested
              ? (revisionNote ?? null)
              : null,
        },
      );

      // 3. If approved, grant the role and copy declared specializations
      if (status === RequestStatus.approved) {
        await tx.user.update({
          where: { id: request.userId },
          data: { roleType: { push: request.roleType } },
        });

        const appKey = `${request.roleType}Application` as keyof typeof request;
        const app = request[appKey] as { specializations?: string[] } | null;
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

    const notificationByStatus = {
      [RequestStatus.approved]: {
        type: "role_request_approved",
        title: "Application approved",
        message: `Your ${result.roleType} application has been approved!`,
      },
      [RequestStatus.rejected]: {
        type: "role_request_rejected",
        title: "Application rejected",
        message: `Your ${result.roleType} application was rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ""}`,
      },
      [RequestStatus.revision_requested]: {
        type: "role_request_revision_requested",
        title: "Documents need a fix",
        message: `Your ${result.roleType} application needs revised documents before it can be approved.${revisionNote ? ` Note: ${revisionNote}` : ""}`,
      },
    } as const;
    const notification =
      notificationByStatus[status as keyof typeof notificationByStatus];

    if (notification) {
      await NotificationService.create({
        userId: result.userId,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        metadata: { requestId, roleType: result.roleType, status },
      });
    }

    console.log("Notification created successfully");

    return result.updatedRequest;
  }

  /**
   * Applicant resubmits only the documents an admin flagged on a
   * revision_requested application — not a fresh application. Any document
   * not flagged stays as originally uploaded and is never re-requested.
   */
  static async resubmitDocuments(
    requestId: string,
    userId: string,
    documents: Record<string, string>,
  ) {
    const request = await RoleRequestRepo.findRequestById(requestId);
    if (!request) throw new Error("Application not found");
    if (request.userId !== userId) {
      throw new Error("This application does not belong to you");
    }
    if (request.status !== RequestStatus.revision_requested) {
      throw new Error(
        "Only an application awaiting document revision can be resubmitted",
      );
    }

    const flagged = request.flaggedDocuments ?? [];
    const submittedKeys = Object.keys(documents);
    if (submittedKeys.length === 0) {
      throw new Error("No documents were provided");
    }
    const unflagged = submittedKeys.filter((key) => !flagged.includes(key));
    if (unflagged.length > 0) {
      throw new Error(
        `These documents were not flagged for resubmission: ${unflagged.join(", ")}`,
      );
    }

    const fileColumns: Record<string, string> = {};
    for (const key of submittedKeys) {
      const column = DOCUMENT_FIELD_TO_DB_COLUMN[key];
      if (!column) throw new Error(`Unknown document field: ${key}`);
      fileColumns[column] = documents[key];
    }

    const applicationModel = APPLICATION_MODEL_BY_ROLE[request.roleType];
    await RoleRequestRepo.updateApplicationFiles(
      applicationModel,
      requestId,
      fileColumns,
    );

    const remainingFlagged = flagged.filter(
      (key) => !submittedKeys.includes(key),
    );
    const updated = await RoleRequestRepo.applyResubmission(
      requestId,
      remainingFlagged,
    );

    return { updated, reopened: remainingFlagged.length === 0 };
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
