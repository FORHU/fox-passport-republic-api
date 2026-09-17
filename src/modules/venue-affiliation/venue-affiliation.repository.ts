import { prisma } from "../../utils/prisma";
import { AffiliationInitiator, AffiliationStatus } from "@prisma/client";
import { VENUE_AFFILIATION_PERMISSIONS } from "../../types/permissions";

export default class VenueAffiliationRepo {
  static async findByVenueAndFoxer(venueId: string, eventFoxerId: string) {
    return prisma.venueEventFoxerAffiliation.findUnique({
      where: { venueId_eventFoxerId: { venueId, eventFoxerId } },
    });
  }

  static async findById(id: string) {
    return prisma.venueEventFoxerAffiliation.findUnique({
      where: { id },
      include: {
        venue: { select: { id: true, name: true, mayorId: true } },
        eventFoxer: { select: { id: true, name: true, imgId: true } },
      },
    });
  }

  /**
   * `permissions` is always the full, fixed Phase A grant — set explicitly
   * from `VENUE_AFFILIATION_PERMISSIONS` here rather than left to the
   * schema's `@default(...)`, so the allow-list is the one place this is
   * decided and no caller can influence it (nothing in this module accepts
   * a client-supplied `permissions` value; there is no input path to guard
   * against, only an invariant to keep visible). Per-affiliation permission
   * customization is explicitly out of scope for Phase A — see
   * VENUE_AFFILIATION_PERMISSIONS's doc comment.
   */
  static async create(data: {
    venueId: string;
    eventFoxerId: string;
    initiatedBy: AffiliationInitiator;
  }) {
    return prisma.venueEventFoxerAffiliation.create({
      data: { ...data, permissions: [...VENUE_AFFILIATION_PERMISSIONS] },
      include: {
        venue: { select: { id: true, name: true, mayorId: true } },
        eventFoxer: { select: { id: true, name: true, imgId: true } },
      },
    });
  }

  /**
   * Re-opens a rejected/revoked row for a fresh application/invite, rather
   * than inserting a second row — `@@unique([venueId, eventFoxerId])` means
   * there is exactly one relationship row per pair for its whole lifecycle.
   * A revoked or rejected affiliation cannot regain access on its own: this
   * is only ever called from `apply`/`invite`, i.e. a fresh, explicit
   * request from one of the two parties, and it lands back on `pending` —
   * never directly on `approved`.
   */
  static async reopen(id: string, initiatedBy: AffiliationInitiator) {
    return prisma.venueEventFoxerAffiliation.update({
      where: { id },
      data: {
        initiatedBy,
        status: AffiliationStatus.pending,
        permissions: [...VENUE_AFFILIATION_PERMISSIONS],
        reviewedById: null,
        reviewedAt: null,
        rejectionReason: null,
      },
      include: {
        venue: { select: { id: true, name: true, mayorId: true } },
        eventFoxer: { select: { id: true, name: true, imgId: true } },
      },
    });
  }

  static async setStatus(
    id: string,
    status: AffiliationStatus,
    reviewedById: string,
    rejectionReason?: string,
  ) {
    return prisma.venueEventFoxerAffiliation.update({
      where: { id },
      data: { status, reviewedById, reviewedAt: new Date(), rejectionReason },
    });
  }

  static async findMine(userId: string) {
    const [asEventFoxer, asVenueMayor] = await Promise.all([
      prisma.venueEventFoxerAffiliation.findMany({
        where: { eventFoxerId: userId },
        include: {
          venue: {
            select: {
              id: true,
              name: true,
              mayorId: true,
              images: { take: 1, select: { url: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.venueEventFoxerAffiliation.findMany({
        where: { venue: { mayorId: userId } },
        include: {
          venue: { select: { id: true, name: true } },
          eventFoxer: { select: { id: true, name: true, imgId: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return { asEventFoxer, asVenueMayor };
  }

  static async findForVenue(venueId: string) {
    return prisma.venueEventFoxerAffiliation.findMany({
      where: { venueId },
      include: {
        eventFoxer: { select: { id: true, name: true, imgId: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }
}
