import {
  AppointmentKind,
  AppointmentStatus,
  TransactionStatus,
  UserPath,
} from "@prisma/client";
import { prisma } from "../../utils/prisma";

/**
 * XP on the Organizer Passport path — docs/adr/0005 and the Organizer row of
 * the Path/Level table in CONTEXT.md.
 *
 * An Organizer is not paid through the platform, so this path is their record
 * of the work: it is what tells a Mayor or Event Owner choosing whom to invite
 * who has done this before. It pays only for work that actually happened —
 * an Event that reached `completed`, and guests actually checked in — and the
 * check-in part is capped per Event, so an Owner appointing a friend cannot
 * turn scanning into a farm.
 *
 * Only Organizers earn it. A Check-in Helper holds no Organizer role and so no
 * Organizer path; an Owner earns on their own path already.
 */

export const ORGANIZER_XP = {
  /** Each Event an Organizer helped run that reached `completed`. */
  eventCompleted: 150,
  /** Each guest an Organizer checked in. */
  guestCheckedIn: 5,
  /** The most check-in XP one Organizer can earn from one Event. */
  checkInCapPerEvent: 100,
} as const;

/**
 * Everyone who organised this Event as an Organizer: its own Organizers, and
 * the Organizers of any Venue it was held at (an approved venue booking).
 */
async function organizersOf(eventId: string, onlyUserId?: string) {
  const live = {
    kind: AppointmentKind.organizer,
    status: AppointmentStatus.active,
    ...(onlyUserId && { userId: onlyUserId }),
  };
  const rows = await prisma.appointment.findMany({
    where: {
      OR: [
        { ...live, eventId },
        {
          ...live,
          venue: {
            transactions: {
              some: { eventId, status: TransactionStatus.approved },
            },
          },
        },
      ],
    },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}

async function award(userId: string, amount: number) {
  const { default: PassportSvc } = await import("../passport/passport.service");
  await PassportSvc.awardXP(userId, UserPath.organizer, amount);
}

async function ensureLedger(userId: string, eventId: string) {
  await prisma.organizerEventXp.upsert({
    where: { userId_eventId: { userId, eventId } },
    create: { userId, eventId },
    update: {},
  });
}

export default class OrganizerXpService {
  /**
   * `userId` just checked a guest in at `eventId`. Pays them check-in XP if
   * they are one of its Organizers and this Event has not yet paid them the
   * cap. Never throws: XP must not be able to fail a check-in.
   */
  static async onGuestCheckedIn(eventId: string, userId: string) {
    try {
      const [organizer] = await organizersOf(eventId, userId);
      if (!organizer) return;

      await ensureLedger(userId, eventId);
      const amount = ORGANIZER_XP.guestCheckedIn;
      // Guarded increment: only moves if it stays within the cap, so two scans
      // landing at once cannot both slip past it.
      const { count } = await prisma.organizerEventXp.updateMany({
        where: {
          userId,
          eventId,
          checkInXp: { lte: ORGANIZER_XP.checkInCapPerEvent - amount },
        },
        data: { checkInXp: { increment: amount } },
      });
      if (count === 1) await award(userId, amount);
    } catch (e) {
      console.error("Organizer check-in XP failed", e);
    }
  }

  /**
   * `eventId` reached `completed`. Pays every one of its Organizers once, no
   * matter how many times completion runs. Never throws.
   */
  static async onEventCompleted(eventId: string) {
    try {
      const organizers = await organizersOf(eventId);
      for (const userId of organizers) {
        await ensureLedger(userId, eventId);
        const { count } = await prisma.organizerEventXp.updateMany({
          where: { userId, eventId, completedAt: null },
          data: { completedAt: new Date() },
        });
        if (count === 1) await award(userId, ORGANIZER_XP.eventCompleted);
      }
    } catch (e) {
      console.error("Organizer completion XP failed", e);
    }
  }
}
