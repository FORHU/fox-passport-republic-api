import { Prisma, RequestStatus } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { badRequest, conflict, notFound } from "../../utils/errors";
import { userCache } from "../../utils/cache-namespaces";
import NotificationService from "../notifications/user-notification.service";

/** The documents an admin can be shown. Text in the DB, closed here. */
export const ID_TYPES = [
  "passport",
  "drivers_license",
  "national_id",
  "other",
] as const;
export type IdType = (typeof ID_TYPES)[number];

export const isIdType = (value: unknown): value is IdType =>
  typeof value === "string" && (ID_TYPES as readonly string[]).includes(value);

// What the applicant sees of their own submission — never the file links,
// which only an admin reviewing it needs.
const OWN_SELECT = {
  id: true,
  idType: true,
  status: true,
  rejectionReason: true,
  createdAt: true,
  reviewedAt: true,
} satisfies Prisma.IdentityVerificationSelect;

const ADMIN_SELECT = {
  ...OWN_SELECT,
  user: { select: { id: true, name: true, email: true, username: true } },
  // isPrivate + storageKey let signPrivateFiles swap in a short-lived link.
  idFile: {
    select: {
      url: true,
      name: true,
      type: true,
      isPrivate: true,
      storageKey: true,
    },
  },
  selfieFile: {
    select: {
      url: true,
      name: true,
      type: true,
      isPrivate: true,
      storageKey: true,
    },
  },
  reviewer: { select: { id: true, name: true } },
} satisfies Prisma.IdentityVerificationSelect;

/**
 * An optional government-ID check for citizens, reviewed by an admin. Approval
 * sets `User.identityVerifiedAt`, which only drives a "Verified" badge —
 * booking still needs nothing beyond a verified email.
 */
export default class IdentityVerificationSvc {
  /** The badge state plus the latest submission, for the /kyc page. */
  static async getMine(userId: string) {
    const [user, latest] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { identityVerifiedAt: true },
      }),
      prisma.identityVerification.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: OWN_SELECT,
      }),
    ]);
    if (!user) throw notFound("User");
    return { verifiedAt: user.identityVerifiedAt, latest };
  }

  /**
   * Run before the upload, so a submission that would be refused never puts
   * someone's ID in the bucket.
   */
  static async assertCanSubmit(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { identityVerifiedAt: true },
    });
    if (!user) throw notFound("User");
    if (user.identityVerifiedAt) {
      throw conflict("Your identity is already verified");
    }
    const pending = await prisma.identityVerification.findFirst({
      where: { userId, status: RequestStatus.pending },
      select: { id: true },
    });
    if (pending) throw conflict("Your ID is already being reviewed");
  }

  static async submit(
    userId: string,
    idType: IdType,
    idFileId: string,
    selfieFileId?: string,
  ) {
    try {
      return await prisma.identityVerification.create({
        data: { userId, idType, idFileId, selfieFileId },
        select: OWN_SELECT,
      });
    } catch (e) {
      // The one-pending-per-user index: a second submit raced the first past
      // assertCanSubmit.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        throw conflict("Your ID is already being reviewed");
      }
      throw e;
    }
  }

  /** The admin queue — oldest first while pending, so nobody waits longest. */
  static async list(status?: RequestStatus) {
    return prisma.identityVerification.findMany({
      where: status ? { status } : {},
      orderBy: {
        createdAt: status === RequestStatus.pending ? "asc" : "desc",
      },
      take: 200,
      select: ADMIN_SELECT,
    });
  }

  static async review(
    id: string,
    reviewerId: string,
    decision: "approved" | "rejected",
    reason?: string,
  ) {
    const rejectionReason = reason?.trim() || null;
    if (decision === "rejected" && !rejectionReason) {
      throw badRequest("Give a reason, so they know what to fix");
    }

    const reviewed = await prisma.$transaction(async (tx) => {
      const row = await tx.identityVerification.findUnique({
        where: { id },
        select: { userId: true },
      });
      if (!row) throw notFound("Identity verification");

      // Conditional on still being pending, so two admins deciding at once
      // can't both win.
      const now = new Date();
      const { count } = await tx.identityVerification.updateMany({
        where: { id, status: RequestStatus.pending },
        data: {
          status: decision,
          reviewedBy: reviewerId,
          reviewedAt: now,
          rejectionReason: decision === "rejected" ? rejectionReason : null,
        },
      });
      if (count === 0) {
        throw conflict("This submission has already been reviewed");
      }
      if (decision === "approved") {
        await tx.user.update({
          where: { id: row.userId },
          data: { identityVerifiedAt: now },
        });
      }
      return row;
    });

    // Public profiles are cached with the badge field in them.
    if (decision === "approved") await userCache.invalidateAll();

    await NotificationService.create({
      userId: reviewed.userId,
      type:
        decision === "approved"
          ? "identity_verification_approved"
          : "identity_verification_rejected",
      title: decision === "approved" ? "Identity verified" : "ID not accepted",
      message:
        decision === "approved"
          ? "Your ID was approved — your profile now shows a Verified badge."
          : `We couldn't accept the ID you sent. Reason: ${rejectionReason}`,
      metadata: { verificationId: id, status: decision },
    });

    return reviewed;
  }
}
