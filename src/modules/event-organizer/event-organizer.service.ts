import { prisma } from "../../utils/prisma";
import {
  can,
  DELEGABLE_EVENT_PERMISSIONS,
  DelegableEventPermission,
} from "../../types/permissions";
import EventOrganizerRepo from "./event-organizer.repository";
import NotificationService from "../notifications/user-notification.service";

function assertCanManage(
  event: { organizerId: string },
  callerId: string,
  callerSystemRole: string,
) {
  if (event.organizerId !== callerId && !can(callerSystemRole, "event:manage-organizers")) {
    throw new Error(
      "Unauthorized: only this event's organizer can manage its delegates",
    );
  }
}

export default class EventOrganizerService {
  static async list(
    eventId: string,
    callerId: string,
    callerSystemRole: string,
  ) {
    const event = await EventOrganizerRepo.findEvent(eventId);
    if (!event) throw new Error("Event not found");
    assertCanManage(event, callerId, callerSystemRole);

    return EventOrganizerRepo.list(eventId);
  }

  static async assign(
    eventId: string,
    callerId: string,
    callerSystemRole: string,
    email: string,
    permissions?: DelegableEventPermission[],
  ) {
    const event = await EventOrganizerRepo.findEvent(eventId);
    if (!event) throw new Error("Event not found");
    assertCanManage(event, callerId, callerSystemRole);

    if (permissions) {
      const invalid = permissions.filter(
        (p) => !DELEGABLE_EVENT_PERMISSIONS.includes(p),
      );
      if (invalid.length > 0) {
        throw new Error(`Not a delegable permission: ${invalid.join(", ")}`);
      }
    }

    const target = await prisma.user.findUnique({ where: { email } });
    if (!target) throw new Error("No user found with that email");
    if (target.id === event.organizerId) {
      throw new Error("This person already organizes the event");
    }

    const existing = await EventOrganizerRepo.find(eventId, target.id);
    if (existing) throw new Error("Already an organizer for this event");

    const assignment = await EventOrganizerRepo.create({
      eventId,
      userId: target.id,
      assignedById: callerId,
      permissions,
    });

    NotificationService.create({
      userId: target.id,
      type: "event_organizer_assigned",
      title: "You're now an event organizer",
      message: `You can check guests in for "${event.name}".`,
      metadata: { eventId, link: "/creator-dashboard/check-in" },
    }).catch((e) =>
      console.error("Failed to create event-organizer notification", e),
    );

    return assignment;
  }

  static async remove(
    eventId: string,
    callerId: string,
    callerSystemRole: string,
    targetUserId: string,
  ) {
    const event = await EventOrganizerRepo.findEvent(eventId);
    if (!event) throw new Error("Event not found");
    assertCanManage(event, callerId, callerSystemRole);

    const existing = await EventOrganizerRepo.find(eventId, targetUserId);
    if (!existing) throw new Error("Not an organizer for this event");

    await EventOrganizerRepo.remove(eventId, targetUserId);
  }

  static get delegablePermissions() {
    return DELEGABLE_EVENT_PERMISSIONS;
  }
}
