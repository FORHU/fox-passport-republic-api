import RoleRequestRepo, {
  OPEN_REQUEST_STATUSES,
} from "./role-request.repository";
import UsersRepo from "../users/users.repository";
import { RoleType, RequestStatus } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import {
  acceptedMimeTypes,
  FILE_UNSUPPORTED,
} from "../../utils/file-signature";
import { badRequest, notFound } from "../../utils/errors";
import NotificationService from "../notifications/user-notification.service";
import {
  BASE_MAX_YEARS_OF_EXPERIENCE,
  EXPERIENCE_CV_PDF_MESSAGE,
} from "../../utils/years-of-experience";

/** How a closed request reads in "This application was already …". */
const DECIDED_LABEL: Partial<Record<RequestStatus, string>> = {
  [RequestStatus.approved]: "approved",
  [RequestStatus.rejected]: "rejected",
  [RequestStatus.withdrawn]: "withdrawn",
};

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
  [RoleType.investor]: "investorApplication",
  [RoleType.organizer]: "organizerApplication",
  [RoleType.providerFoxer]: "providerFoxerApplication",
};

/**
 * Supply roles folded into `providerFoxer` (#228, #273) and removed from
 * `RoleType`; every holder and application was moved to providerFoxer by the
 * 20261109140000 migration. Older clients may still send one, so it gets a
 * pointer to Provider instead of a bare "Invalid role type".
 */
export const RETIRED_APPLICATION_ROLES: readonly string[] = [
  "gearFoxer",
  "serviceFoxer",
  "performerFoxer",
];

/** The reason an application for `roleType` is refused as retired, or null. */
export function retiredRoleError(roleType: unknown): string | null {
  return typeof roleType === "string" &&
    RETIRED_APPLICATION_ROLES.includes(roleType)
    ? `New ${roleType} applications are closed. Apply for providerFoxer (Provider) instead.`
    : null;
}

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

// Every application column that points at an uploaded document.
const DOCUMENT_COLUMNS = [
  ...Object.values(DOCUMENT_FIELD_TO_DB_COLUMN),
  "proofFileId", // investor proof of funds
];

/**
 * An application may only point at files its own applicant uploaded —
 * otherwise anyone holding a file id could attach (and get an admin to look
 * at) someone else's document.
 */
async function assertOwnDocuments(userId: string, fileIds: unknown[]) {
  const ids = [
    ...new Set(
      fileIds.filter((v): v is string => typeof v === "string" && v !== ""),
    ),
  ];
  if (ids.length === 0) return;
  const owned = await prisma.file.count({
    where: { id: { in: ids }, uploadedBy: userId },
  });
  if (owned !== ids.length) {
    throw new Error("One of the documents could not be found");
  }
}

/**
 * A portfolio / resume is a PDF or Word document (app#371). The upload route
 * already checks the bytes when told it is a portfolio, but a file uploaded
 * as an identity document (an image) could still be named as the portfolio,
 * so the stored type is checked again here. Ownership is checked separately.
 */
async function assertPortfolioDocument(fileId: unknown) {
  if (typeof fileId !== "string" || fileId === "") return;
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: { type: true },
  });
  if (!file?.type || !acceptedMimeTypes("portfolio").includes(file.type)) {
    throw badRequest(FILE_UNSUPPORTED.portfolio);
  }
}

/**
 * The CV behind a claim of more than 30 years is a PDF only (api#423), so the
 * admin checking it can read it in the browser. A plain portfolio may still
 * be Word.
 */
async function assertPdfCv(fileId: unknown) {
  if (typeof fileId !== "string" || fileId === "") return;
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: { type: true },
  });
  if (file?.type !== "application/pdf") {
    throw badRequest(EXPERIENCE_CV_PDF_MESSAGE);
  }
}

// What a portfolio may be but an identity document may not: Word files.
const PORTFOLIO_ONLY_TYPES = acceptedMimeTypes("portfolio").filter(
  (type) => !acceptedMimeTypes("document").includes(type),
);

/**
 * The other way round: a Word file uploaded as a portfolio must not be named
 * as an ID, clearance or proof of funds (app#371). Files stored before Word
 * was accepted anywhere are unaffected.
 */
async function assertIdentityDocuments(fileIds: unknown[]) {
  const ids = fileIds.filter(
    (v): v is string => typeof v === "string" && v !== "",
  );
  if (ids.length === 0) return;
  const files = await prisma.file.findMany({
    where: { id: { in: ids } },
    select: { type: true },
  });
  if (files.some((f) => f.type && PORTFOLIO_ONLY_TYPES.includes(f.type))) {
    throw badRequest(FILE_UNSUPPORTED.document);
  }
}

type SpecialtyDetail = {
  slug: string;
  description: string;
  photoFileIds: string[];
};

/**
 * A Provider's per-specialty details (api#440), checked for shape by the
 * controller, become nested rows. Photos must be images the applicant
 * uploaded themselves, like any document they name.
 */
async function providerSpecialtyRows(userId: string, details: unknown) {
  if (!Array.isArray(details)) return undefined;
  const list = details as SpecialtyDetail[];
  const ids = list.flatMap((d) => d.photoFileIds);
  await assertOwnDocuments(userId, ids);
  if (ids.length > 0) {
    const files = await prisma.file.findMany({
      where: { id: { in: ids } },
      select: { type: true },
    });
    if (files.some((f) => !f.type?.startsWith("image/"))) {
      throw badRequest("Photos of your work must be images");
    }
  }
  return {
    create: list.map((d) => ({
      slug: d.slug,
      description: d.description,
      photos: {
        create: d.photoFileIds.map((fileId, position) => ({
          fileId,
          position,
        })),
      },
    })),
  };
}

/** How an admin settles a claim of more than 30 years (api#423). */
export type ExperienceDecision = "base" | "claimed";

export default class RoleRequestService {
  /**
   * Submit an application for a specific role
   */
  static async submitApplication(
    userId: string,
    roleType: RoleType,
    applicationData: RoleApplicationData,
  ) {
    const retired = retiredRoleError(roleType);
    if (retired) throw new Error(retired);

    // 1. Check if user already has this role
    const user = await UsersRepo.findUserById(userId);
    if (!user) throw new Error("User not found");

    if (user.roleType.includes(roleType)) {
      throw new Error(`User already has the ${roleType} role`);
    }

    // 2. Check for an open application for this role: pending, or sent back
    // for document revision (api#367; it used to see pending only, so a sent
    // back applicant could open a second application for the same role).
    const pending = await RoleRequestRepo.findPendingRequest(userId, roleType);
    if (pending) {
      throw new Error(
        pending.status === RequestStatus.revision_requested
          ? `Your application for the ${roleType} role was sent back for document fixes. Resubmit those documents or withdraw it before applying again`
          : `An application for the ${roleType} role is already pending`,
      );
    }

    // Convert empty strings to null so optional FK fields don't violate constraints
    const cleanedData = Object.fromEntries(
      Object.entries(applicationData).map(([k, v]) => [k, v === "" ? null : v]),
    );
    await assertOwnDocuments(
      userId,
      DOCUMENT_COLUMNS.map((column) => cleanedData[column]),
    );
    await assertPortfolioDocument(cleanedData.portfolioFileId);
    if (cleanedData.claimedExperience != null) {
      await assertPdfCv(cleanedData.portfolioFileId);
    }
    await assertIdentityDocuments(
      DOCUMENT_COLUMNS.filter((column) => column !== "portfolioFileId").map(
        (column) => cleanedData[column],
      ),
    );
    if (roleType === RoleType.providerFoxer) {
      const rows = await providerSpecialtyRows(
        userId,
        cleanedData.specialtyDetails,
      );
      if (rows) cleanedData.specialtyDetails = rows;
      else delete cleanedData.specialtyDetails;
    } else {
      delete cleanedData.specialtyDetails;
    }

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
   *
   * `experienceDecision` settles a claim of more than 30 years (api#423):
   * "base" lowers `experience` to 30, as when the CV and its references don't
   * bear it out; "claimed" restores the claim. The claim itself is kept.
   */
  static async reviewApplication(
    requestId: string,
    adminId: string,
    status: RequestStatus,
    rejectionReason?: string,
    flaggedDocuments?: string[],
    revisionNote?: string,
    experienceDecision?: ExperienceDecision,
  ) {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch request
      const request = await RoleRequestRepo.findRequestById(requestId);
      if (!request) throw new Error("Application not found");
      if (request.status !== RequestStatus.pending) {
        throw new Error("This application has already been processed");
      }

      if (experienceDecision) {
        const app = request[
          `${request.roleType}Application` as keyof typeof request
        ] as { claimedExperience?: number | null } | null;
        const claimed = app?.claimedExperience;
        if (!claimed) {
          throw new Error(
            "This application doesn't claim more than 30 years of experience",
          );
        }
        const years =
          experienceDecision === "base"
            ? BASE_MAX_YEARS_OF_EXPERIENCE
            : claimed;
        // The Event Foxer column is text.
        await RoleRequestRepo.updateApplicationExperience(
          APPLICATION_MODEL_BY_ROLE[request.roleType],
          requestId,
          request.roleType === RoleType.eventFoxer ? String(years) : years,
        );
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
      // No longer pending: its applicant withdrew it after the read above
      // (api#367). Nothing is granted for it.
      if (!updatedRequest) {
        throw new Error("This application has already been processed");
      }

      // 3. If approved, grant the role and copy declared specializations
      if (status === RequestStatus.approved) {
        // Grant the role once. Two open applications can end up for the same
        // role (two legacy supply applications both became providerFoxer), and
        // approving the second must not list the role twice.
        if (!request.user.roleType.includes(request.roleType)) {
          await tx.user.update({
            where: { id: request.userId },
            data: { roleType: { push: request.roleType } },
          });
        }

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

    await assertOwnDocuments(userId, Object.values(documents));
    await assertPortfolioDocument(documents.portfolioFile);
    const application = request[
      `${request.roleType}Application` as keyof typeof request
    ] as { claimedExperience?: number | null } | null | undefined;
    if (application?.claimedExperience != null) {
      await assertPdfCv(documents.portfolioFile);
    }
    await assertIdentityDocuments(
      Object.entries(documents)
        .filter(([key]) => key !== "portfolioFile")
        .map(([, fileId]) => fileId),
    );

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
   * The applicant withdraws their own application while no admin has decided
   * it: pending, or sent back for document revision (api#367). Someone else's
   * request answers as not found, so its existence isn't confirmed.
   */
  static async withdrawApplication(requestId: string, userId: string) {
    const request = await RoleRequestRepo.findRequestStatus(requestId);
    if (!request || request.userId !== userId) {
      throw notFound("Application");
    }
    if (!OPEN_REQUEST_STATUSES.includes(request.status)) {
      throw badRequest(
        `This application was already ${DECIDED_LABEL[request.status] ?? request.status} and can't be withdrawn`,
        "APPLICATION_DECIDED",
      );
    }
    // Conditional on still being open: an admin decision that lands between
    // the read above and this write wins, and the applicant is told.
    const withdrawn = await RoleRequestRepo.withdrawRequest(requestId, userId);
    if (withdrawn === 0) {
      throw badRequest(
        "This application was decided while you were withdrawing it",
        "APPLICATION_DECIDED",
      );
    }
    return {
      id: request.id,
      roleType: request.roleType,
      status: RequestStatus.withdrawn,
    };
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
