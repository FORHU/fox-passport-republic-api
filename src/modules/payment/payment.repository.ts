import { prisma } from "../../utils/prisma";
import { bookingCache } from "../../utils/cache-namespaces";
import { PaymentStatus } from "@prisma/client";

/**
 * A ceiling on the all-payments list, not pagination. Same reasoning as the
 * admin queues: it read the whole table of all time, newest-first, and the
 * screen that calls it renders what it gets.
 */
const PAYMENT_LIMIT = 500;

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

  // READ ALL with filters
  static async getAllPayments(
    filters?: {
      bookingId?: string;
      paymentStatus?: PaymentStatus;
    },
    take = PAYMENT_LIMIT,
  ) {
    return prisma.payment.findMany({
      where: {
        ...(filters?.bookingId && { bookingId: String(filters.bookingId) }),
        ...(filters?.paymentStatus && { status: filters.paymentStatus }),
      },
      include: {
        booking: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            event: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
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
      include: {
        booking: {
          include: {
            user: true,
            event: true,
          },
        },
      },
    });
  }

  // READ ONE by Transaction ID
  static async getPaymentByTransactionId(transactionId: string) {
    return prisma.payment.findUnique({
      where: { transactionId },
      include: {
        booking: {
          include: {
            user: true,
            event: true,
          },
        },
      },
    });
  }

  // CREATE
  static async createPayment(data: {
    bookingId: string;
    amount: number;
    currency: string;
    method: string;
    paymentType: "deposit" | "full";
    paymentStatus: PaymentStatus;
    transactionId: string;
    expiresAt?: Date;
    paidAt?: Date;
  }) {
    return this.retiring(
      prisma.payment.create({
        data: {
          bookingId: String(data.bookingId),
          amount: data.amount,
          currency: data.currency,
          method: data.method,
          paymentType: data.paymentType,
          status: data.paymentStatus,
          transactionId: data.transactionId,
          expiresAt: data.expiresAt,
          paidAt: data.paidAt,
        },
        include: {
          booking: true,
        },
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
        include: {
          booking: true,
        },
      }),
    );
  }

  /**
   * The three queries the Stripe webhook used to run against `prisma` itself.
   *
   * `findFirstByTransactionId` is deliberately not `getPaymentByTransactionId`
   * above: that one is a `findUnique` carrying the booking, its user and its
   * event, and the refund handler needs none of them. Moved verbatim.
   */
  static async findFirstByTransactionId(transactionId: string) {
    return prisma.payment.findFirst({ where: { transactionId } });
  }

  static async setTransactionId(id: string, transactionId: string) {
    return this.retiring(
      prisma.payment.update({ where: { id }, data: { transactionId } }),
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

  // Check if transaction ID exists
  static async transactionIdExists(transactionId: string) {
    const payment = await prisma.payment.findUnique({
      where: { transactionId },
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
    return prisma.payment.findMany({
      where: { bookingId: String(bookingId) },
      orderBy: {
        createdAt: "desc",
      },
      take,
    });
  }

  // Lazy cancellation of expired payments
  static async cancelExpiredPayments() {
    const now = new Date();

    // 1. Find expired pending payments
    const expiredPayments = await prisma.payment.findMany({
      where: {
        status: PaymentStatus.pending,
        expiresAt: { lt: now },
      },
      select: { id: true, bookingId: true },
    });

    if (expiredPayments.length === 0) return 0;

    const paymentIds = expiredPayments.map((p) => p.id);
    const bookingIds = [...new Set(expiredPayments.map((p) => p.bookingId))];

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
