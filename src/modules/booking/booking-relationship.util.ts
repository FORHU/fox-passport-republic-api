import { prisma } from "../../utils/prisma";

const ACTIVE_STATUSES = ["pending", "confirmed", "active"] as const;

/**
 * Whether two users currently have a live booking/contract between them —
 * as a citizen booking the other's event, or as the counterparty on a
 * service/asset booking. Used to block someone mid-contract from blocking
 * their counterparty out of the relationship.
 *
 * Mirrors the citizen<->organizer join in
 * ConversationService.assertCanMessage's Rule 1, extended to
 * ServiceBooking/AssetBooking and filtered to non-terminal status.
 */
export async function hasActiveBookingBetween(
  a: string,
  b: string,
): Promise<boolean> {
  const [booking, serviceBooking, assetBooking] = await Promise.all([
    prisma.booking.findFirst({
      where: {
        status: { in: [...ACTIVE_STATUSES] },
        OR: [
          { userId: a, event: { organizerId: b } },
          { userId: b, event: { organizerId: a } },
        ],
      },
      select: { id: true },
    }),
    prisma.serviceBooking.findFirst({
      where: {
        status: { in: [...ACTIVE_STATUSES] },
        OR: [
          { userId: a, service: { ownerId: b } },
          { userId: b, service: { ownerId: a } },
        ],
      },
      select: { id: true },
    }),
    prisma.assetBooking.findFirst({
      where: {
        status: { in: [...ACTIVE_STATUSES] },
        OR: [
          { userId: a, asset: { ownerId: b } },
          { userId: b, asset: { ownerId: a } },
        ],
      },
      select: { id: true },
    }),
  ]);

  return !!(booking || serviceBooking || assetBooking);
}
