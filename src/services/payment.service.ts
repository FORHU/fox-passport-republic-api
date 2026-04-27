import PaymentRepo from "../repositories/payment.repository";
import crypto from "crypto";
import { PaymentStatus } from "@prisma/client";
import Stripe from "stripe";
import { prisma } from "../utils/prisma";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2025-04-30.basil',
});

export default class PaymentSvc {
    // Generate unique transaction ID
    static generateTransactionId(): string {
        return `TXN-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    }

    // GET ALL PAYMENTS
    static async getAllPayments(filters?: {
        bookingId?: string;
        paymentStatus?: PaymentStatus;
    }) {
        await PaymentRepo.cancelExpiredPayments();
        return PaymentRepo.getAllPayments(filters);
    }

    // GET PAYMENT BY ID
    static async getPaymentById(id: string) {
        await PaymentRepo.cancelExpiredPayments();
        const payment = await PaymentRepo.getPaymentById(id);
        if (!payment) {
            throw new Error("Payment not found");
        }
        return payment;
    }

    // GET PAYMENT BY TRANSACTION ID
    static async getPaymentByTransactionId(transactionId: string) {
        await PaymentRepo.cancelExpiredPayments();
        const payment = await PaymentRepo.getPaymentByTransactionId(transactionId);
        if (!payment) {
            throw new Error("Payment not found");
        }
        return payment;
    }

    // CREATE PAYMENT
    static async createPayment(data: {
        bookingId: string;
        amount: number;
        currency: string;
        method: string;
        paymentType: "deposit" | "full";
        paymentStatus?: PaymentStatus;
        expiresAt?: Date;
    }) {
        let transactionId = this.generateTransactionId();
        while (await PaymentRepo.transactionIdExists(transactionId)) {
            transactionId = this.generateTransactionId();
        }

        return PaymentRepo.createPayment({
            bookingId: data.bookingId,
            amount: data.amount,
            currency: data.currency || "PHP",
            method: data.method,
            paymentType: data.paymentType,
            paymentStatus: data.paymentStatus || PaymentStatus.pending,
            transactionId,
            expiresAt: data.expiresAt,
        });
    }

    // UPDATE PAYMENT
    static async updatePayment(
        id: string,
        data: Partial<{
            paymentStatus: PaymentStatus;
        }>
    ) {
        // Check if payment exists and is not expired/cancelled
        const payment = await PaymentRepo.getPaymentById(id);
        if (!payment) {
            throw new Error("Payment not found");
        }

        if (payment.status === PaymentStatus.cancelled) {
            throw new Error("Cannot update a cancelled payment");
        }

        if (payment.expiresAt && new Date() > payment.expiresAt && payment.status === PaymentStatus.pending) {
            await PaymentRepo.cancelExpiredPayments();
            throw new Error("Payment has expired and is now cancelled");
        }

        const updated = await PaymentRepo.updatePayment(id, data);

        // If deposit payment is completed, confirm the booking
        if (data.paymentStatus === PaymentStatus.completed && updated.paymentType === "deposit") {
            await (require("../utils/prisma").prisma.booking.update({
                where: { id: updated.bookingId },
                data: { status: "confirmed" }
            }));
        }

        // If full payment is completed, mark booking as completed
        if (data.paymentStatus === PaymentStatus.completed && updated.paymentType === "full") {
            await (require("../utils/prisma").prisma.booking.update({
                where: { id: updated.bookingId },
                data: { status: "completed" }
            }));
        }

        return updated;
    }

    // CALCULATE REMAINING BALANCE
    static async getRemainingBalance(bookingId: string) {
        const BookingRepo = require("../repositories/booking.repository").default;
        const booking = await BookingRepo.findById(bookingId);
        if (!booking) throw new Error("Booking not found");

        const totalAgreed = [
            ...(booking.assetTransactions || []),
            ...(booking.serviceTransactions || []),
            ...(booking.venueTransactions || [])
        ].reduce((sum: number, t: any) => sum + (t.agreedPrice || 0), 0);

        const paidAmount = (booking.payments || [])
            .filter((p: any) => p.status === PaymentStatus.completed)
            .reduce((sum: number, p: any) => sum + p.amount, 0);

        return {
            totalAmount: totalAgreed,
            paidAmount,
            remainingBalance: Math.max(0, totalAgreed - paidAmount),
            currency: (booking.event && booking.event.currency) || "PHP"
        };
    }

    // GET BOOKING PAYMENTS
    static async getBookingPayments(bookingId: string) {
        return PaymentRepo.getBookingPayments(bookingId);
    }
}
