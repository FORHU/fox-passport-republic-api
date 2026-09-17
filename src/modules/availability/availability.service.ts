import { AppTransactionClient } from "../../utils/prisma";
import {
  AvailabilityCheckItem,
  AvailabilityConflictError,
  RESERVING_TRANSACTION_STATUSES,
} from "./availability.types";

/**
 * The single choke point every asset/service reservation in this codebase
 * must pass through — template/marketplace transactions (EventAssetTransaction
 * / EventServiceTransaction), bidding acceptance, and direct bookings
 * (AssetBooking / ServiceBooking) alike. Every method requires a live
 * AppTransactionClient: there is no overload accepting the bare prisma
 * singleton, so a caller cannot reserve without a lock, and the lock and the
 * subsequent insert are always in the same transaction.
 *
 * Lock target is always the parent Asset/Service row itself (never the
 * reservation rows, which may not exist yet at creation time). The conflict
 * read always happens AFTER the FOR UPDATE lock is acquired, never before —
 * acquiring the lock first is what makes the read trustworthy: any other
 * transaction attempting the same sequence blocks at the same acquisition
 * point until this one commits or rolls back, so nothing can be committed
 * between the read and the eventual insert.
 */
export default class AvailabilitySvc {
  private static sortDeterministically(
    items: AvailabilityCheckItem[],
  ): AvailabilityCheckItem[] {
    return [...items].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
      return a.itemId.localeCompare(b.itemId);
    });
  }

  /** Used at creation time — nothing to exclude, the item has no reservation yet. */
  static async reserve(
    tx: AppTransactionClient,
    items: AvailabilityCheckItem[],
  ): Promise<void> {
    for (const item of this.sortDeterministically(items)) {
      await this.lockAndCheckOne(tx, item, undefined);
    }
  }

  /**
   * Used at checkout time — same lock/read, but excludes rows belonging to
   * `bookingId` itself, so a booking's own already-reserved items are never
   * counted as conflicts against themselves.
   */
  static async validateForCheckout(
    tx: AppTransactionClient,
    bookingId: string,
    items: AvailabilityCheckItem[],
  ): Promise<void> {
    for (const item of this.sortDeterministically(items)) {
      await this.lockAndCheckOne(tx, item, bookingId);
    }
  }

  private static async lockAndCheckOne(
    tx: AppTransactionClient,
    item: AvailabilityCheckItem,
    excludeBookingId: string | undefined,
  ): Promise<void> {
    if (item.kind === "asset") {
      await this.lockAndCheckAsset(tx, item, excludeBookingId);
    } else {
      await this.lockAndCheckService(tx, item, excludeBookingId);
    }
  }

  private static async lockAndCheckAsset(
    tx: AppTransactionClient,
    item: AvailabilityCheckItem,
    excludeBookingId: string | undefined,
  ): Promise<void> {
    // Raw SQL is required here only for the FOR UPDATE verb — Prisma's
    // client API has no way to express it. Everything else below uses the
    // normal typed client, reading under the lock we just took on this
    // connection/transaction.
    await tx.$executeRaw`SELECT id FROM assets WHERE id = ${item.itemId} FOR UPDATE`;

    const asset = await tx.asset.findUniqueOrThrow({
      where: { id: item.itemId },
      select: { quantity: true },
    });

    const requestedQuantity = item.quantity ?? 1;
    const { start, end } = item.dateRange;

    const bookingExclusion = excludeBookingId
      ? { OR: [{ bookingId: null }, { bookingId: { not: excludeBookingId } }] }
      : {};

    const [templateReserved, directReserved] = await Promise.all([
      tx.eventAssetTransaction.aggregate({
        _sum: { quantity: true },
        where: {
          assetId: item.itemId,
          status: { in: [...RESERVING_TRANSACTION_STATUSES] },
          event: { startAt: { lt: end }, endAt: { gt: start } },
          ...bookingExclusion,
        },
      }),
      // Direct-booking flow — checked unconditionally, closing the
      // cross-flow gap. AssetBooking has no relation to Booking.id at all,
      // so it is never subject to the exclusion above.
      tx.assetBooking.aggregate({
        _sum: { quantity: true },
        where: {
          assetId: item.itemId,
          status: { not: "cancelled" },
          startDate: { lt: end },
          endDate: { gt: start },
        },
      }),
    ]);

    const alreadyReserved =
      (templateReserved._sum.quantity ?? 0) + (directReserved._sum.quantity ?? 0);

    if (alreadyReserved + requestedQuantity > asset.quantity) {
      throw new AvailabilityConflictError(
        `Asset ${item.itemId} does not have enough available quantity for the requested date range`,
        "asset",
        item.itemId,
      );
    }
  }

  private static async lockAndCheckService(
    tx: AppTransactionClient,
    item: AvailabilityCheckItem,
    excludeBookingId: string | undefined,
  ): Promise<void> {
    await tx.$executeRaw`SELECT id FROM services WHERE id = ${item.itemId} FOR UPDATE`;

    const { start, end } = item.dateRange;

    const bookingExclusion = excludeBookingId
      ? { OR: [{ bookingId: null }, { bookingId: { not: excludeBookingId } }] }
      : {};

    const [templateConflict, directConflict] = await Promise.all([
      tx.eventServiceTransaction.findFirst({
        where: {
          serviceId: item.itemId,
          status: { in: [...RESERVING_TRANSACTION_STATUSES] },
          event: { startAt: { lt: end }, endAt: { gt: start } },
          ...bookingExclusion,
        },
        select: { id: true },
      }),
      // ServiceBooking.endDate is nullable — a null end is treated as a
      // same-day service, so its effective end is its own scheduledDate.
      tx.serviceBooking.findFirst({
        where: {
          serviceId: item.itemId,
          status: { not: "cancelled" },
          scheduledDate: { lt: end },
          OR: [
            { endDate: { gt: start } },
            { endDate: null, scheduledDate: { gt: start } },
          ],
        },
        select: { id: true },
      }),
    ]);

    if (templateConflict || directConflict) {
      throw new AvailabilityConflictError(
        `Service ${item.itemId} is not available for the requested date range`,
        "service",
        item.itemId,
      );
    }
  }
}
