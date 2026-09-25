import {
  AppointmentEndReason,
  AppointmentKind,
  AppointmentStatus,
  EventStatus,
  RoleType,
} from "@prisma/client";
import { can, permissionsForAppointment } from "../../types/permissions";
import NotificationService from "../notifications/user-notification.service";
import AppointmentRepo, { AppointmentTarget } from "./appointment.repository";
import {
  INVITATION_TTL_MS,
  isAppointmentLive,
  isInvitationOpen,
} from "./appointment.access";

/**
 * Appointments — see docs/adr/0005-organizer-role-and-appointments.md.
 *
 * Only the Mayor or Event Owner makes or removes Appointments (an admin with
 * `event:manage-organizers` may too). An Organizer must hold the Organizer
 * role and accept an invitation; a Check-in Helper is anyone, added by email,
 * effective at once. Either side can end it.
 */

export class AppointmentError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "AppointmentError";
  }
}

interface Caller {
  userId: string;
  systemRole: string;
}

interface ResolvedTarget {
  target: AppointmentTarget;
  kind: "event" | "venue";
  name: string;
  ownerId: string;
}

async function resolveTarget(
  target: AppointmentTarget,
): Promise<ResolvedTarget> {
  if (target.eventId) {
    const event = await AppointmentRepo.findEvent(target.eventId);
    if (!event) throw new AppointmentError("Event not found", 404);
    return {
      target,
      kind: "event",
      name: event.name,
      ownerId: event.organizerId,
    };
  }
  const venue = await AppointmentRepo.findVenue(target.venueId!);
  if (!venue) throw new AppointmentError("Venue not found", 404);
  return { target, kind: "venue", name: venue.name, ownerId: venue.mayorId };
}

function assertCanManage(resolved: ResolvedTarget, caller: Caller) {
  if (
    resolved.ownerId !== caller.userId &&
    !can(caller.systemRole, "event:manage-organizers")
  ) {
    throw new AppointmentError(
      resolved.kind === "event"
        ? "Only this event's owner can manage its organizers and helpers"
        : "Only this venue's Mayor can manage its organizers and helpers",
      403,
    );
  }
}

function notify(
  userId: string,
  type: string,
  title: string,
  message: string,
  metadata: Record<string, unknown>,
) {
  NotificationService.create({ userId, type, title, message, metadata }).catch(
    (e) => console.error(`Failed to create ${type} notification`, e),
  );
}

/** Where a notification about an Appointment should send people. A Check-in
 * Helper holds no role, so the dashboard would turn them away; they go
 * straight to the scanner. */
const LINK = "/creator-dashboard";
const CHECK_IN_LINK = "/creator-dashboard/check-in";
// Where a Mayor or Event Owner answers requests.
const TEAM_LINK = "/creator-dashboard/team";

/** How many requests an Organizer may have waiting at once. */
export const MAX_OPEN_REQUESTS = 5;

/**
 * An invitation or request past its expiry is dead, but its stored status
 * still holds the person's one live place on the team (the partial unique
 * index in the appointments migration). Close it off so a new invitation or
 * request can be made, and treat it as gone.
 */
async function retireIfExpired<
  T extends { id: string; status: AppointmentStatus; expiresAt: Date | null },
>(appointment: T | null): Promise<T | null> {
  if (!appointment) return null;
  const pending =
    appointment.status === AppointmentStatus.invited ||
    appointment.status === AppointmentStatus.requested;
  if (!pending || isInvitationOpen(appointment, new Date())) return appointment;
  await AppointmentRepo.expire(appointment.id);
  return null;
}

/**
 * What the reader sees for each Appointment: the stored status, plus the two
 * states that are derived rather than written — an invitation past its
 * expiry, and an Event Appointment whose Event is over.
 */
export function displayState(
  appointment: {
    kind: AppointmentKind;
    status: AppointmentStatus;
    expiresAt: Date | null;
    event?: { startAt: Date; endAt: Date; eventStatus: EventStatus } | null;
  },
  now: Date = new Date(),
):
  | "invited"
  | "requested"
  | "expired"
  | "active"
  | "finished"
  | "declined"
  | "ended" {
  if (
    appointment.status === AppointmentStatus.invited ||
    appointment.status === AppointmentStatus.requested
  ) {
    return isInvitationOpen(appointment, now) ? appointment.status : "expired";
  }
  if (appointment.status === AppointmentStatus.active) {
    return isAppointmentLive(appointment, appointment.event ?? null, now)
      ? "active"
      : "finished";
  }
  return appointment.status;
}

export default class AppointmentService {
  static async list(target: AppointmentTarget, caller: Caller) {
    const resolved = await resolveTarget(target);
    assertCanManage(resolved, caller);
    const now = new Date();
    const event = target.eventId
      ? await AppointmentRepo.findEvent(target.eventId)
      : null;
    const rows = await AppointmentRepo.listForTarget(target);
    return rows.map((row) => ({
      ...row,
      state: displayState({ ...row, event }, now),
    }));
  }

  /**
   * Invite an Organizer, or add a Check-in Helper. The person is found by
   * email because that is what an Owner has in hand at the door.
   */
  static async appoint(
    target: AppointmentTarget,
    caller: Caller,
    // `userId` when the Owner picked someone from the Organizer search;
    // `email` when they typed one in.
    input: { kind: AppointmentKind; email?: string; userId?: string },
  ) {
    const resolved = await resolveTarget(target);
    assertCanManage(resolved, caller);

    if (target.eventId) {
      const event = await AppointmentRepo.findEvent(target.eventId);
      if (
        event &&
        (event.eventStatus === EventStatus.cancelled ||
          event.eventStatus === EventStatus.completed)
      ) {
        throw new AppointmentError(
          "This event is over — no one new can be appointed to it",
        );
      }
    }

    const person = input.userId
      ? await AppointmentRepo.findUserById(input.userId)
      : await AppointmentRepo.findUserByEmail(input.email ?? "");
    if (!person) {
      throw new AppointmentError(
        input.userId ? "User not found" : "No user found with that email",
        404,
      );
    }
    if (person.id === resolved.ownerId) {
      throw new AppointmentError(
        `You already run this ${resolved.kind} — owners are always organizers of what they own`,
      );
    }
    if (
      input.kind === AppointmentKind.organizer &&
      !person.roleType.includes(RoleType.organizer)
    ) {
      throw new AppointmentError(
        "Only approved Organizers can be invited as organizers. They can apply for the role, or you can add them as a check-in helper.",
      );
    }

    const existing = await retireIfExpired(
      await AppointmentRepo.findLive(target, person.id),
    );
    if (existing) {
      throw new AppointmentError(
        existing.status === AppointmentStatus.invited
          ? "This person already has an open invitation"
          : existing.status === AppointmentStatus.requested
            ? "This person has already asked to join — accept their request below"
            : `This person is already on this ${resolved.kind}'s team`,
        409,
      );
    }

    const now = new Date();
    const isOrganizer = input.kind === AppointmentKind.organizer;
    const appointment = await AppointmentRepo.create({
      target,
      kind: input.kind,
      status: isOrganizer
        ? AppointmentStatus.invited
        : AppointmentStatus.active,
      userId: person.id,
      appointedById: caller.userId,
      permissions: permissionsForAppointment(input.kind, resolved.kind),
      expiresAt: isOrganizer
        ? new Date(now.getTime() + INVITATION_TTL_MS)
        : null,
      respondedAt: isOrganizer ? null : now,
    });

    notify(
      person.id,
      isOrganizer ? "appointment_invited" : "appointment_check_in_helper",
      isOrganizer
        ? `You're invited to organize "${resolved.name}"`
        : `You can check guests in at "${resolved.name}"`,
      isOrganizer
        ? `Accept the invitation to help run this ${resolved.kind}. It expires in 14 days.`
        : `You've been added as a check-in helper for this ${resolved.kind}.`,
      {
        appointmentId: appointment.id,
        ...target,
        link: isOrganizer ? LINK : CHECK_IN_LINK,
      },
    );

    return {
      ...appointment,
      state: displayState({ ...appointment, event: null }, now),
    };
  }

  // ── Organizer requests ─────────────────────────────────────────────────
  // The other way into a team: an approved Organizer asks, and the Mayor or
  // Event Owner accepts or declines. Only where the owner has switched
  // requests on, at most MAX_OPEN_REQUESTS open at once per Organizer, and
  // expiring unanswered after the same 14 days as an invitation.

  /**
   * What an approved Organizer can offer to help run: Venues and upcoming
   * Events whose owners accept requests. Empty for anyone without the role.
   */
  static async openToRequests(userId: string) {
    const person = await AppointmentRepo.findUserById(userId);
    if (!person?.roleType.includes(RoleType.organizer)) {
      return { venues: [], events: [] };
    }
    return AppointmentRepo.openToRequests(userId, new Date(), 20);
  }

  /** Whether `userId` could ask to join this Venue or Event, and if not why. */
  static async joinStatus(target: AppointmentTarget, userId: string) {
    const resolved = await resolveTarget(target);
    const settings = target.eventId
      ? await AppointmentRepo.findEvent(target.eventId)
      : await AppointmentRepo.findVenue(target.venueId!);
    const accepts = !!settings?.acceptsOrganizerRequests;
    const person = await AppointmentRepo.findUserById(userId);
    const existing = await AppointmentRepo.findLive(target, userId);
    const now = new Date();

    const reason =
      resolved.ownerId === userId
        ? "owner"
        : !person?.roleType.includes(RoleType.organizer)
          ? "not_organizer"
          : existing?.status === AppointmentStatus.active
            ? "on_team"
            : existing && isInvitationOpen(existing, now)
              ? existing.status === AppointmentStatus.invited
                ? "invited"
                : "requested"
              : !accepts
                ? "closed"
                : null;
    return {
      acceptsRequests: accepts,
      canRequest: reason === null,
      reason,
      appointmentId: existing?.id ?? null,
    };
  }

  static async requestToJoin(target: AppointmentTarget, userId: string) {
    const status = await AppointmentService.joinStatus(target, userId);
    if (!status.canRequest) {
      const message: Record<string, string> = {
        owner:
          "You already run this — owners are always organizers of what they own",
        not_organizer:
          "Only approved Organizers can ask to join. Apply for the role first.",
        on_team: "You're already on this team",
        invited: "You've already been invited — accept the invitation instead",
        requested: "You've already asked to join",
        closed: "This isn't taking requests from Organizers right now",
      };
      throw new AppointmentError(
        message[status.reason!] ?? "You can't ask to join this",
        status.reason === "not_organizer" ? 403 : 409,
      );
    }

    const now = new Date();
    if (
      (await AppointmentRepo.countOpenRequests(userId, now)) >=
      MAX_OPEN_REQUESTS
    ) {
      throw new AppointmentError(
        `You can have at most ${MAX_OPEN_REQUESTS} requests waiting at once. Withdraw one, or wait for an answer.`,
        429,
      );
    }

    // joinStatus let an expired invitation or request through; close it so the
    // new request can take its place.
    await retireIfExpired(await AppointmentRepo.findLive(target, userId));

    const resolved = await resolveTarget(target);
    const appointment = await AppointmentRepo.create({
      target,
      kind: AppointmentKind.organizer,
      status: AppointmentStatus.requested,
      userId,
      // The owner who will answer — the one who would have sent an invitation.
      appointedById: resolved.ownerId,
      permissions: permissionsForAppointment(
        AppointmentKind.organizer,
        resolved.kind,
      ),
      expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
      respondedAt: null,
    });

    const person = await AppointmentRepo.findUserById(userId);
    notify(
      resolved.ownerId,
      "appointment_requested",
      `${person?.name ?? "An Organizer"} wants to help run "${resolved.name}"`,
      `Accept or decline their request from your Team page. It expires in 14 days.`,
      { appointmentId: appointment.id, ...target, link: TEAM_LINK },
    );
    return appointment;
  }

  /** The Mayor or Event Owner answers an Organizer's request. */
  static async respondToRequest(
    target: AppointmentTarget,
    appointmentId: string,
    caller: Caller,
    accept: boolean,
  ) {
    const resolved = await resolveTarget(target);
    assertCanManage(resolved, caller);
    const appointment = await AppointmentRepo.findById(appointmentId);
    if (
      !appointment ||
      appointment.status !== AppointmentStatus.requested ||
      appointment.eventId !== (target.eventId ?? null) ||
      appointment.venueId !== (target.venueId ?? null)
    ) {
      throw new AppointmentError("Request not found", 404);
    }
    const now = new Date();
    if (!isInvitationOpen(appointment, now)) {
      throw new AppointmentError("This request has expired", 410);
    }
    if (accept) {
      // The role can be taken away while a request waits.
      const person = await AppointmentRepo.findUserById(appointment.userId);
      if (!person?.roleType.includes(RoleType.organizer)) {
        throw new AppointmentError(
          "This person no longer holds the Organizer role",
          409,
        );
      }
    }
    const updated = await AppointmentRepo.respond(
      appointmentId,
      accept ? AppointmentStatus.active : AppointmentStatus.declined,
      now,
    );
    notify(
      appointment.userId,
      accept ? "appointment_request_accepted" : "appointment_request_declined",
      accept ? `You're on the team for "${resolved.name}"` : "Request declined",
      accept
        ? `Your request to help run this ${resolved.kind} was accepted.`
        : `Your request to help run "${resolved.name}" was declined.`,
      { appointmentId, link: LINK },
    );
    return updated;
  }

  /** The Organizer takes back a request nobody has answered yet. */
  static async withdrawRequest(appointmentId: string, userId: string) {
    const appointment = await AppointmentRepo.findById(appointmentId);
    if (
      !appointment ||
      appointment.userId !== userId ||
      appointment.status !== AppointmentStatus.requested
    ) {
      throw new AppointmentError("Request not found", 404);
    }
    return AppointmentRepo.end(
      appointmentId,
      AppointmentEndReason.left,
      userId,
      new Date(),
    );
  }

  static async getSettings(target: AppointmentTarget, caller: Caller) {
    const resolved = await resolveTarget(target);
    assertCanManage(resolved, caller);
    const row = target.eventId
      ? await AppointmentRepo.findEvent(target.eventId)
      : await AppointmentRepo.findVenue(target.venueId!);
    return { acceptsOrganizerRequests: !!row?.acceptsOrganizerRequests };
  }

  static async setSettings(
    target: AppointmentTarget,
    caller: Caller,
    input: { acceptsOrganizerRequests: boolean },
  ) {
    const resolved = await resolveTarget(target);
    assertCanManage(resolved, caller);
    return AppointmentRepo.setAcceptsRequests(
      target,
      input.acceptsOrganizerRequests,
    );
  }

  /**
   * Approved Organizers to invite, for anyone who owns something to invite
   * them to. Returns a profile card — name, city, specializations and Organizer
   * path level — and never an email.
   */
  static async searchOrganizers(
    caller: Caller & { roleType?: string[] },
    filter: { q?: string; specialization?: string },
  ) {
    const roles = caller.roleType ?? [];
    if (
      !roles.includes(RoleType.venueFoxer) &&
      !roles.includes(RoleType.eventFoxer) &&
      !can(caller.systemRole, "event:manage-organizers")
    ) {
      throw new AppointmentError(
        "Only Mayors and Event Owners can search for Organizers",
        403,
      );
    }
    const rows = await AppointmentRepo.searchOrganizers({
      ...filter,
      excludeUserId: caller.userId,
      limit: 20,
    });
    return rows.map((u) => {
      const path = u.passport?.paths[0];
      return {
        id: u.id,
        name: u.name,
        imgId: u.imgId,
        city: u.city,
        specializations: u.foxerSpecializations.map((s) => s.category),
        level: path?.level ?? 1,
        totalXP: path?.totalXP ?? 0,
      };
    });
  }

  static async accept(appointmentId: string, userId: string) {
    const appointment = await AppointmentService.ownInvitation(
      appointmentId,
      userId,
    );
    const now = new Date();
    if (!isInvitationOpen(appointment, now)) {
      throw new AppointmentError("This invitation has expired", 410);
    }
    // The role can be taken away while an invitation is open.
    const person = await AppointmentRepo.findUserById(userId);
    if (!person?.roleType.includes(RoleType.organizer)) {
      throw new AppointmentError(
        "You need the Organizer role to accept this invitation",
        403,
      );
    }

    const updated = await AppointmentRepo.respond(
      appointmentId,
      AppointmentStatus.active,
      now,
    );
    notify(
      updated.appointedById,
      "appointment_accepted",
      "Invitation accepted",
      `${person.name ?? person.email} is now an organizer of "${targetName(updated)}".`,
      { appointmentId, link: LINK },
    );
    return updated;
  }

  static async decline(appointmentId: string, userId: string) {
    const appointment = await AppointmentService.ownInvitation(
      appointmentId,
      userId,
    );
    if (!isInvitationOpen(appointment, new Date())) {
      throw new AppointmentError("This invitation has expired", 410);
    }
    return AppointmentRepo.respond(
      appointmentId,
      AppointmentStatus.declined,
      new Date(),
    );
  }

  /** The appointed person steps down. */
  static async leave(appointmentId: string, userId: string) {
    const appointment = await AppointmentRepo.findById(appointmentId);
    if (!appointment || appointment.userId !== userId) {
      throw new AppointmentError("Appointment not found", 404);
    }
    if (appointment.status !== AppointmentStatus.active) {
      throw new AppointmentError("You are not currently on this team");
    }
    const ended = await AppointmentRepo.end(
      appointmentId,
      AppointmentEndReason.left,
      userId,
      new Date(),
    );
    notify(
      appointment.appointedById,
      "appointment_left",
      "Someone left your team",
      `An organizer or helper left "${targetName(ended)}".`,
      { appointmentId, link: LINK },
    );
    return ended;
  }

  /** The Mayor or Event Owner removes someone, or withdraws an invitation. */
  static async remove(
    target: AppointmentTarget,
    appointmentId: string,
    caller: Caller,
  ) {
    const resolved = await resolveTarget(target);
    assertCanManage(resolved, caller);
    const appointment = await AppointmentRepo.findById(appointmentId);
    if (
      !appointment ||
      appointment.eventId !== (target.eventId ?? null) ||
      appointment.venueId !== (target.venueId ?? null)
    ) {
      throw new AppointmentError("Appointment not found", 404);
    }
    if (
      appointment.status !== AppointmentStatus.active &&
      appointment.status !== AppointmentStatus.invited
    ) {
      throw new AppointmentError("This appointment has already ended");
    }
    const ended = await AppointmentRepo.end(
      appointmentId,
      AppointmentEndReason.removed,
      caller.userId,
      new Date(),
    );
    notify(
      appointment.userId,
      "appointment_removed",
      appointment.status === AppointmentStatus.invited
        ? "Invitation withdrawn"
        : "You were removed from a team",
      `You're no longer on the team for "${resolved.name}".`,
      { appointmentId, link: LINK },
    );
    return ended;
  }

  /** Pending invitations and current teams, for the person themselves. */
  static async mine(userId: string) {
    const now = new Date();
    const rows = await AppointmentRepo.listForUser(userId);
    return rows.map((row) => ({ ...row, state: displayState(row, now) }));
  }

  /**
   * An admin took the Organizer role away: every Organizer Appointment ends
   * at once. Check-in Helper Appointments need no role, so they stay.
   * History is kept and nothing comes back on re-approval (ADR 0005).
   */
  static async endForRevokedOrganizer(userId: string, actorId: string) {
    return AppointmentRepo.endMany(
      { userId, kind: AppointmentKind.organizer },
      AppointmentEndReason.role_revoked,
      actorId,
      new Date(),
    );
  }

  /**
   * The Mayor or Event Owner lost the role that made them one: their teams
   * end with it — every Appointment on their Venues when `venueFoxer` goes,
   * on their Events when `eventFoxer` goes.
   */
  static async endForRevokedOwner(
    ownerId: string,
    lost: { venueFoxer: boolean; eventFoxer: boolean },
    actorId: string,
  ) {
    const scopes = [
      ...(lost.venueFoxer ? [{ venue: { mayorId: ownerId } }] : []),
      ...(lost.eventFoxer ? [{ event: { organizerId: ownerId } }] : []),
    ];
    if (scopes.length === 0) return [];
    return AppointmentRepo.endMany(
      { OR: scopes },
      AppointmentEndReason.owner_role_revoked,
      actorId,
      new Date(),
    );
  }

  private static async ownInvitation(appointmentId: string, userId: string) {
    const appointment = await AppointmentRepo.findById(appointmentId);
    if (!appointment || appointment.userId !== userId) {
      throw new AppointmentError("Invitation not found", 404);
    }
    if (appointment.status !== AppointmentStatus.invited) {
      throw new AppointmentError("This invitation has already been answered");
    }
    return appointment;
  }
}

function targetName(appointment: {
  event?: { name: string } | null;
  venue?: { name: string } | null;
}) {
  return appointment.event?.name ?? appointment.venue?.name ?? "your team";
}
