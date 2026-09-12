import { prisma } from "../../utils/prisma";
import { bookingCache } from "../../utils/cache-namespaces";
import { PaymentStatus, InvoiceSourceType, InvoiceStatus } from "@prisma/client";

/**
 * A ceiling on the all-payments list, not pagination. Same reasoning as the
 * admin queues: it read the whole table of all time, newest-first, and the
 * screen that calls it renders what it gets.
 */
const PAYMENT_LIMIT = 500;

/**
 * How long a `pending` payment is allowed to sit with no provider callback
 * before `cancelExpiredPayments` sweeps it. Replaces the old per-row
 * `expiresAt` column, which the central-payment `Payment` model no longer
 * carries — every payment here is judged against its own age instead.
 */
export const PENDING_PAYMENT_TTL_MS = 30 * 60 * 1000;

const bookingInvoiceInclude = {
  invoice: {
    include: {
      payer: { select: { id: true, name: true, email: true } },
      items: {
        where: { sourceType: InvoiceSourceType.booking },
        select: { sourceId: true },
      },
    },
  },
} as const;

export default class PaymentRepo {
  /**
   * Retires the cached booking reads, for the same reason `BookingRepo` does:
   * `BookingRepo.findById` includes `payments`, so a payment row changing
   * changes what the booking page says. Wrapped around every write here.
   */
  private static async retiring<T>(write: Promise<T>): Promise<T> {
    const result = await write;
    await bookingCache.invalidateAll();
    return result;
  }

  /**
   * A booking's Invoice, found through the `InvoiceItem` that names it
   * (`sourceType: booking`, `sourceId: bookingId`) — `Payment` carries an
   * `invoiceId` now, not a `bookingId`, so every booking-payment lookup goes
   * through this one level of indirection.
   */
  private static async findInvoiceIdForBooking(
    bookingId: string,
  ): Promise<string | null> {
    const item = await prisma.invoiceItem.findFirst({
      where: { sourceType: InvoiceSourceType.booking, sourceId: bookingId },
      select: { invoiceId: true },
    });
    return item?.invoiceId ?? null;
  }

  /**
   * Creates the one-item Invoice a booking's first payment attaches to.
   * Deliberately bypasses `InvoiceSvc.createInvoice`'s pricing engine and
   * double-invoicing guard: a booking's markup and platform fee are already
   * computed onto the `Booking` row itself (`hostMarkup`/`platformFee`)
   * elsewhere in `booking.service.ts`, so running the amount through the
   * pricing engine again here would double-apply the fee. This Invoice is
   * just the ledger row `Payment`s attach to, not a re-pricing.
   */
  private static async createInvoiceForBooking(
    bookingId: string,
    amount: number,
    currency: string,
  ): Promise<string> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { userId: true },
    });
    if (!booking) throw new Error("Booking not found");

    const invoice = await prisma.invoice.create({
      data: {
        payerId: booking.userId,
        subtotalAmount: amount,
        discountedSubtotal: amount,
        grossAmount: amount,
        currency,
        status: InvoiceStatus.pending,
        items: {
          create: [
            {
              amount,
              description: `Booking ${bookingId}`,
              sourceType: InvoiceSourceType.booking,
              sourceId: bookingId,
            },
          ],
        },
      },
      select: { id: true },
    });
    return invoice.id;
  }

  /** Reuses a booking's existing Invoice (a retried payment attempt) or creates one. */
  private static async resolveInvoiceId(
    bookingId: string,
    amount: number,
    currency: string,
  ): Promise<string> {
    const existing = await this.findInvoiceIdForBooking(bookingId);
    if (existing) return existing;
    return this.createInvoiceForBooking(bookingId, amount, currency);
  }

  // READ ALL with filters
  static async getAllPayments(
    filters?: {
      bookingId?: string;
      paymentStatus?: PaymentStatus;
    },
    take = PAYMENT_LIMIT,
  ) {
    let invoiceId: string | undefined;
    if (filters?.bookingId) {
      const found = await this.findInvoiceIdForBooking(filters.bookingId);
      if (!found) return [];
      invoiceId = found;
    }

    return prisma.payment.findMany({
      where: {
        ...(invoiceId && { invoiceId }),
        ...(filters?.paymentStatus && { status: filters.paymentStatus }),
      },
      include: bookingInvoiceInclude,
      orderBy: {
        paidAt: "desc",
      },
      take,
    });
  }

  // READ ONE by ID
  static async getPaymentById(id: string) {
    return prisma.payment.findUnique({
      where: { id: String(id) },
      include: bookingInvoiceInclude,
    });
  }

  // READ ONE by provider reference (was "transaction ID")
  static async getPaymentByTransactionId(providerReference: string) {
    return prisma.payment.findUnique({
      where: { providerReference },
      include: bookingInvoiceInclude,
    });
  }

  // CREATE
  static async createPayment(data: {
    bookingId: string;
    amount: number;
    currency: string;
    method: string;
    /**
     * No longer stored — the central `Payment` model has no slot for
     * deposit/full distinction. Kept in the accepted shape so callers don't
     * all need editing too; ignored here.
     */
    paymentType: "deposit" | "full";
    paymentStatus: PaymentStatus;
    transactionId: string;
    /** No longer stored — see `PENDING_PAYMENT_TTL_MS`. Ignored here. */
    expiresAt?: Date;
    paidAt?: Date;
  }) {
    const invoiceId = await this.resolveInvoiceId(
      data.bookingId,
      data.amount,
      data.currency,
    );

    return this.retiring(
      prisma.payment.create({
        data: {
          invoiceId,
          amount: data.amount,
          method: data.method,
          status: data.paymentStatus,
          providerReference: data.transactionId,
          paidAt: data.paidAt,
        },
        include: bookingInvoiceInclude,
      }),
    );
  }

  // UPDATE
  static async updatePayment(
    id: string,
    data: Partial<{
      paymentStatus: PaymentStatus;
      paidAt?: Date;
    }>,
  ) {
    return this.retiring(
      prisma.payment.update({
        where: { id: String(id) },
        data: {
          ...(data.paymentStatus ? { status: data.paymentStatus } : {}),
          ...(data.paidAt ? { paidAt: data.paidAt } : {}),
        },
        include: bookingInvoiceInclude,
      }),
    );
  }

  /**
   * The three queries the Stripe webhook used to run against `prisma` itself.
   *
   * `findFirstByTransactionId` is deliberately not `getPaymentByTransactionId`
   * above: that one is a `findUnique` carrying the invoice and its payer, and
   * the refund handler needs neither. Moved verbatim.
   */
  static async findFirstByTransactionId(providerReference: string) {
    return prisma.payment.findFirst({ where: { providerReference } });
  }

  static async setTransactionId(id: string, providerReference: string) {
    return this.retiring(
      prisma.payment.update({ where: { id }, data: { providerReference } }),
    );
  }

  static async markRefunded(id: string) {
    return this.retiring(
      prisma.payment.update({
        where: { id },
        data: { status: PaymentStatus.refunded },
      }),
    );
  }

  // Check if payment exists
  static async paymentExists(id: string) {
    const payment = await prisma.payment.findUnique({
      where: { id: String(id) },
      select: { id: true },
    });
    return !!payment;
  }

  // Check if a provider reference is already in use
  static async transactionIdExists(providerReference: string) {
    const payment = await prisma.payment.findUnique({
      where: { providerReference },
      select: { id: true },
    });
    return !!payment;
  }

  // Get booking payments
  /**
   * One booking's payments. Bounded too, though a booking realistically holds
   * two or three - a deposit, a balance, and whatever Stripe retried. The cap
   * is there so that a runaway retry loop cannot turn the booking page into a
   * thousand-row response.
   */
  static async getBookingPayments(bookingId: string, take = PAYMENT_LIMIT) {
    const invoiceId = await this.findInvoiceIdForBooking(bookingId);
    if (!invoiceId) return [];

    return prisma.payment.findMany({
      where: { invoiceId },
      orderBy: {
        createdAt: "desc",
      },
      take,
    });
  }

  // Lazy cancellation of expired (long-stale-pending) payments
  static async cancelExpiredPayments() {
    const cutoff = new Date(Date.now() - PENDING_PAYMENT_TTL_MS);

    // 1. Find stale pending payments, and the bookings they belong to via
    // their invoice's `booking`-sourced InvoiceItem.
    const expiredPayments = await prisma.payment.findMany({
      where: {
        status: PaymentStatus.pending,
        createdAt: { lt: cutoff },
      },
      select: {
        id: true,
        invoice: {
          select: {
            items: {
              where: { sourceType: InvoiceSourceType.booking },
              select: { sourceId: true },
            },
          },
        },
      },
    });

    if (expiredPayments.length === 0) return 0;

    const paymentIds = expiredPayments.map((p) => p.id);
    const bookingIds = [
      ...new Set(
        expiredPayments.flatMap((p) =>
          p.invoice.items.map((i) => i.sourceId),
        ),
      ),
    ];

    // 2. Batch cancel payments and their related bookings
    await this.retiring(
      prisma.$transaction([
        prisma.payment.updateMany({
          where: { id: { in: paymentIds } },
          data: { status: PaymentStatus.cancelled },
        }),
        prisma.booking.updateMany({
          where: {
            id: { in: bookingIds },
            status: "pending", // Only cancel if it's still pending
          },
          data: { status: "cancelled" },
        }),
      ]),
    );

    return expiredPayments.length;
  }
}
