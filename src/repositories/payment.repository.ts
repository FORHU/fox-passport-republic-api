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
                ...(filters?.paymentStatus && { paymentStatus: filters.paymentStatus }),
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
                paymentDate: "desc",
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
        paymentMethod: string;
        paymentStatus: PaymentStatus;
        transactionId: string;
        gatewayResponse?: string;
    }) {
        return prisma.payment.create({
            data: {
                bookingId: String(data.bookingId),
                amount: data.amount,
                currency: data.currency,
                paymentMethod: data.paymentMethod,
                paymentStatus: data.paymentStatus,
                transactionId: data.transactionId,
                gatewayResponse: data.gatewayResponse,
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
            gatewayResponse: string;
        }>
    ) {
        return prisma.payment.update({
            where: { id: String(id) },
            data,
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
                paymentDate: "desc",
            },
        });
    }
}
