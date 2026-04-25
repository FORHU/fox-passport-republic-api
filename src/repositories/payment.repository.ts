import { prisma } from "../utils/prisma";
import { PaymentStatus } from "@prisma/client";

export default class PaymentRepo {
    // READ ALL with filters
    static async getAllPayments(filters?: {
        bookingId?: string;
        paymentStatus?: PaymentStatus;
    }) {
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
    }) {
        return prisma.payment.create({
            data: {
                bookingId: String(data.bookingId),
                amount: data.amount,
                currency: data.currency,
                method: data.method,
                paymentType: data.paymentType,
                status: data.paymentStatus,
                transactionId: data.transactionId,
                expiresAt: data.expiresAt,
            },
            include: {
                booking: true,
            },
        });
    }

    // UPDATE
    static async updatePayment(
        id: string,
        data: Partial<{
            paymentStatus: PaymentStatus;
        }>
    ) {
        return prisma.payment.update({
            where: { id: String(id) },
            data: {
                ...(data.paymentStatus ? { status: data.paymentStatus } : {}),
            },
            include: {
                booking: true,
            },
        });
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
    static async getBookingPayments(bookingId: string) {
        return prisma.payment.findMany({
            where: { bookingId: String(bookingId) },
            orderBy: {
                createdAt: "desc",
            },
        });
    }

    // Lazy cancellation of expired payments
    static async cancelExpiredPayments() {
        const now = new Date();
        
        // 1. Find expired pending payments
        const expiredPayments = await prisma.payment.findMany({
            where: {
                status: PaymentStatus.pending,
                expiresAt: { lt: now }
            },
            select: { id: true, bookingId: true }
        });

        if (expiredPayments.length === 0) return 0;

        const paymentIds = expiredPayments.map(p => p.id);
        const bookingIds = [...new Set(expiredPayments.map(p => p.bookingId))];

        // 2. Batch cancel payments and their related bookings
        await prisma.$transaction([
            prisma.payment.updateMany({
                where: { id: { in: paymentIds } },
                data: { status: PaymentStatus.cancelled }
            }),
            prisma.booking.updateMany({
                where: { 
                    id: { in: bookingIds },
                    status: "pending" // Only cancel if it's still pending
                },
                data: { status: "cancelled" }
            })
        ]);

        return expiredPayments.length;
    }
}
