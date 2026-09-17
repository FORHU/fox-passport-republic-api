import VenueAffiliationRepo from "./venue-affiliation.repository";
import { prisma } from "../../utils/prisma";
import { AffiliationInitiator, AffiliationStatus } from "@prisma/client";
import { VenueAffiliationPermission } from "../../types/permissions";
import NotificationService from "../notifications/user-notification.service";

export default class VenueAffiliationSvc {
  // ── Event Foxer applies to a venue ──────────────────────────────────────
  static async apply(venueId: string, eventFoxerId: string) {
    const venue = await prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) throw new Error("Venue not found");
    if (venue.mayorId === eventFoxerId) {
      throw new Error("You already own this venue");
    }

    const existing = await VenueAffiliationRepo.findByVenueAndFoxer(
      venueId,
      eventFoxerId,
    );
    let affiliation;
    if (existing) {
      if (existing.status === AffiliationStatus.pending) {
        throw new Error("An application to this venue is already pending");
      }
      if (existing.status === AffiliationStatus.approved) {
        throw new Error("You are already affiliated with this venue");
      }
      // rejected or revoked — reopen the same row rather than a second one
      affiliation = await VenueAffiliationRepo.reopen(
        existing.id,
        AffiliationInitiator.eventFoxer,
      );
    } else {
      affiliation = await VenueAffiliationRepo.create({
        venueId,
        eventFoxerId,
        initiatedBy: AffiliationInitiator.eventFoxer,
      });
    }

    await NotificationService.create({
      userId: venue.mayorId,
      type: "venue_affiliation_applied",
      title: "New venue application",
      message: `${affiliation.eventFoxer.name} applied to host events at ${venue.name}`,
      metadata: { affiliationId: affiliation.id, venueId },
    });

    return affiliation;
  }

  // ── Venue mayor invites/employs an Event Foxer ──────────────────────────
  static async invite(venueId: string, eventFoxerId: string, mayorId: string) {
    const venue = await prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) throw new Error("Venue not found");
    if (venue.mayorId !== mayorId) {
      throw new Error("Unauthorized: you do not own this venue");
    }
    if (eventFoxerId === mayorId) {
      throw new Error("You cannot invite yourself");
    }

    const invitee = await prisma.user.findUnique({
      where: { id: eventFoxerId },
    });
    if (!invitee) throw new Error("User not found");
    if (!invitee.roleType.includes("eventFoxer")) {
      throw new Error("This user does not hold the Event Foxer capability");
    }

    const existing = await VenueAffiliationRepo.findByVenueAndFoxer(
      venueId,
      eventFoxerId,
    );
    let affiliation;
    if (existing) {
      if (existing.status === AffiliationStatus.pending) {
        throw new Error(
          "An invitation or application for this pair is already pending",
        );
      }
      if (existing.status === AffiliationStatus.approved) {
        throw new Error(
          "This Event Foxer is already affiliated with this venue",
        );
      }
      affiliation = await VenueAffiliationRepo.reopen(
        existing.id,
        AffiliationInitiator.venueFoxer,
      );
    } else {
      affiliation = await VenueAffiliationRepo.create({
        venueId,
        eventFoxerId,
        initiatedBy: AffiliationInitiator.venueFoxer,
      });
    }

    await NotificationService.create({
      userId: eventFoxerId,
      type: "venue_affiliation_invited",
      title: "Venue invitation",
      message: `${venue.name} invited you to host events there`,
      metadata: { affiliationId: affiliation.id, venueId },
    });

    return affiliation;
  }

  // The party that did NOT initiate is the one who must approve/reject —
  // an application is approved by the venue mayor, an invite by the invitee.
  private static async assertCanDecide(id: string, requesterId: string) {
    const affiliation = await VenueAffiliationRepo.findById(id);
    if (!affiliation) throw new Error("Affiliation not found");
    if (affiliation.status !== AffiliationStatus.pending) {
      throw new Error("This affiliation is not pending");
    }

    const isVenueMayor = affiliation.venue.mayorId === requesterId;
    const isInvitedEventFoxer = affiliation.eventFoxerId === requesterId;

    if (affiliation.initiatedBy === AffiliationInitiator.eventFoxer) {
      if (!isVenueMayor) {
        throw new Error(
          "Unauthorized: only the venue owner can decide this application",
        );
      }
    } else if (!isInvitedEventFoxer) {
      throw new Error(
        "Unauthorized: only the invited Event Foxer can decide this invitation",
      );
    }

    return affiliation;
  }

  // The requester is always one of the two parties on an affiliation (every
  // caller above already enforces that) — this just names "the other one",
  // who is who gets notified of a decision they didn't make themselves.
  private static otherPartyId(
    affiliation: {
      eventFoxerId: string;
      venue: { mayorId: string };
    },
    requesterId: string,
  ) {
    return affiliation.venue.mayorId === requesterId
      ? affiliation.eventFoxerId
      : affiliation.venue.mayorId;
  }

  static async approve(id: string, requesterId: string) {
    const affiliation = await this.assertCanDecide(id, requesterId);
    const updated = await VenueAffiliationRepo.setStatus(
      id,
      AffiliationStatus.approved,
      requesterId,
    );
    await NotificationService.create({
      userId: this.otherPartyId(affiliation, requesterId),
      type: "venue_affiliation_approved",
      title: "Affiliation approved",
      message:
        affiliation.initiatedBy === AffiliationInitiator.eventFoxer
          ? `Your application to host at ${affiliation.venue.name} was approved`
          : `${affiliation.eventFoxer.name} accepted your invitation to host at ${affiliation.venue.name}`,
      metadata: { affiliationId: id, venueId: affiliation.venueId },
    });
    return updated;
  }

  static async reject(id: string, requesterId: string, reason?: string) {
    const affiliation = await this.assertCanDecide(id, requesterId);
    const updated = await VenueAffiliationRepo.setStatus(
      id,
      AffiliationStatus.rejected,
      requesterId,
      reason,
    );
    await NotificationService.create({
      userId: this.otherPartyId(affiliation, requesterId),
      type: "venue_affiliation_rejected",
      title: "Affiliation rejected",
      message:
        (affiliation.initiatedBy === AffiliationInitiator.eventFoxer
          ? `Your application to host at ${affiliation.venue.name} was rejected`
          : `${affiliation.eventFoxer.name} declined your invitation to host at ${affiliation.venue.name}`) +
        (reason ? ` — ${reason}` : ""),
      metadata: { affiliationId: id, venueId: affiliation.venueId },
    });
    return updated;
  }

  /**
   * Withdraws a still-`pending` affiliation — either the applicant or the
   * inviter may do this (whichever party did NOT initiate is free to decide
   * it via `approve`/`reject` instead; this is the "never mind" path either
   * side can take before that decision is made). Distinct from `revoke`:
   * cancelling ends something that was never active, revoking ends
   * something that was. Both land on the same `revoked` status — there is
   * no product need yet to distinguish "cancelled" from "revoked" at the
   * data level, only at the operation/authorization level, so introducing a
   * separate enum value (and its migration) was deferred; ask if the
   * dashboard ever needs to render them differently.
   */
  static async cancel(id: string, requesterId: string) {
    const affiliation = await VenueAffiliationRepo.findById(id);
    if (!affiliation) throw new Error("Affiliation not found");
    if (affiliation.status !== AffiliationStatus.pending) {
      throw new Error(
        "Only a pending affiliation can be cancelled — an approved one must be revoked instead",
      );
    }

    const isVenueMayor = affiliation.venue.mayorId === requesterId;
    const isEventFoxer = affiliation.eventFoxerId === requesterId;
    if (!isVenueMayor && !isEventFoxer) {
      throw new Error("Unauthorized: you are not part of this affiliation");
    }

    const updated = await VenueAffiliationRepo.setStatus(
      id,
      AffiliationStatus.revoked,
      requesterId,
    );
    await NotificationService.create({
      userId: this.otherPartyId(affiliation, requesterId),
      type: "venue_affiliation_cancelled",
      title:
        affiliation.initiatedBy === AffiliationInitiator.eventFoxer
          ? "Application withdrawn"
          : "Invitation withdrawn",
      message:
        affiliation.initiatedBy === AffiliationInitiator.eventFoxer
          ? `${affiliation.eventFoxer.name} withdrew their application to host at ${affiliation.venue.name}`
          : `${affiliation.venue.name} withdrew its invitation`,
      metadata: { affiliationId: id, venueId: affiliation.venueId },
    });
    return updated;
  }

  /**
   * Ends an `approved` affiliation. Venue-owner-only — deliberately NOT
   * open to the affiliated Event Foxer (a change from this method's earlier
   * behavior, made at the product's explicit direction): only the venue's
   * mayor, or a future "authorized venue administrator" concept this
   * codebase doesn't have yet, may revoke. A `rejected` row needs no revoke
   * operation (it's already terminal); a `pending` one is cancelled, not
   * revoked — both cases fall into the same "not approved" branch below and
   * are refused with the same guidance. Once revoked, the row stays
   * `revoked`: nothing reactivates it except a brand new `apply`/`invite`
   * (see `VenueAffiliationRepo.reopen`), which lands back on `pending`,
   * never directly on `approved`.
   */
  static async revoke(id: string, requesterId: string) {
    const affiliation = await VenueAffiliationRepo.findById(id);
    if (!affiliation) throw new Error("Affiliation not found");
    if (affiliation.status !== AffiliationStatus.approved) {
      throw new Error(
        `Only an approved affiliation can be revoked — this one is currently "${affiliation.status}"`,
      );
    }

    if (affiliation.venue.mayorId !== requesterId) {
      throw new Error(
        "Unauthorized: only the venue owner can revoke an approved affiliation",
      );
    }

    const updated = await VenueAffiliationRepo.setStatus(
      id,
      AffiliationStatus.revoked,
      requesterId,
    );
    await NotificationService.create({
      userId: affiliation.eventFoxerId,
      type: "venue_affiliation_revoked",
      title: "Affiliation ended",
      message: `${affiliation.venue.name} ended your affiliation`,
      metadata: { affiliationId: id, venueId: affiliation.venueId },
    });
    return updated;
  }

  static async getMine(userId: string) {
    return VenueAffiliationRepo.findMine(userId);
  }

  static async getForVenue(venueId: string, requesterId: string) {
    const venue = await prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) throw new Error("Venue not found");
    if (venue.mayorId !== requesterId) {
      throw new Error("Unauthorized: you do not own this venue");
    }
    return VenueAffiliationRepo.findForVenue(venueId);
  }

  /**
   * Used by EventTemplateSvc.attachVenue's authorization check and by the
   * blocked-dates endpoint — returns the approved affiliation only if it
   * actually grants `permission`, null otherwise (never throws, since a miss
   * here just means "fall through to the next check", not an error).
   */
  static async getApprovedAffiliationWithPermission(
    venueId: string,
    eventFoxerId: string,
    permission: VenueAffiliationPermission,
  ) {
    const affiliation = await VenueAffiliationRepo.findByVenueAndFoxer(
      venueId,
      eventFoxerId,
    );
    if (!affiliation) return null;
    if (affiliation.status !== AffiliationStatus.approved) return null;
    if (!affiliation.permissions.includes(permission)) return null;
    return affiliation;
  }
}
