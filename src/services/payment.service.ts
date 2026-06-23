import PaymentRepo from "../repositories/payment.repository";
import BookingRepo from "../repositories/booking.repository";
import crypto from "crypto";
import { PaymentStatus } from "@prisma/client";
import Stripe from "stripe";
import { prisma } from "../utils/prisma";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2025-08-27.basil',
});

export default class PaymentSvc {
    // Generate unique transaction ID
    static generateTransactionId(): string {
        return `TXN-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    }

    // CREATE STRIPE PAYMENT INTENT
    static async createPaymentIntent(data: {
        amount: number;
        currency?: string;
        bookingId: string;
        description?: string;
    }) {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(data.amount * 100), // Stripe expects cents
            currency: (data.currency || 'PHP').toLowerCase(),
            metadata: {
                bookingId: data.bookingId,
            },
            description: data.description,
            automatic_payment_methods: {
                enabled: true,
            },
        });

        return {
            clientSecret: paymentIntent.client_secret,
            id: paymentIntent.id,
        };
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
        transactionId?: string;
    }) {
        let transactionId = data.transactionId || this.generateTransactionId();
        while (!data.transactionId && await PaymentRepo.transactionIdExists(transactionId)) {
            transactionId = this.generateTransactionId();
        }

        const payment = await PaymentRepo.createPayment({
            bookingId: data.bookingId,
            amount: data.amount,
            currency: data.currency || "PHP",
            method: data.method,
            paymentType: data.paymentType,
            paymentStatus: data.paymentStatus || PaymentStatus.pending,
            transactionId,
            expiresAt: data.expiresAt,
        });

        // If this payment is a Stripe payment (either method explicitly 'stripe'
        // or the transactionId looks like a Stripe PaymentIntent ID), store the
        // Stripe id on the Booking.stripePaymentId field so the booking is linked
        // to the Stripe payment externally. This keeps booking.stripePaymentId
        // populated for downstream reporting and idempotency checks.
        try {
            const looksLikeStripeId = String(transactionId).startsWith('pi_') || data.method === 'stripe';
            if (looksLikeStripeId) {
                await prisma.booking.update({ where: { id: data.bookingId }, data: { stripePaymentId: transactionId } });
            }
        } catch (err) {
            // Non-fatal: log and continue. Do not fail the payment creation because
            // booking stripePaymentId couldn't be written (unique constraint, etc).
            console.error('Failed to write stripePaymentId to booking:', err);
        }

        return payment;
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

        if (data.paymentStatus === PaymentStatus.completed && updated.paymentType === "deposit") {
            await prisma.booking.update({ where: { id: updated.bookingId }, data: { status: "confirmed" } });
        }

        // Full payment means the citizen has paid in full — it does NOT mean the event
        // has happened yet. Mirrors AssetBooking/ServiceBooking's confirmPayment, which
        // also lands on "confirmed": confirmArrival ("confirmed"/"pending" -> "active")
        // and updateStatus(completed) (-> "completed", which triggers provider payouts)
        // happen afterward, never automatically on payment. See
        // docs/adr/0002-stripe-connect-payouts.md ("Payout timing: on status -> completed").
        if (data.paymentStatus === PaymentStatus.completed && updated.paymentType === "full") {
            await prisma.booking.update({ where: { id: updated.bookingId }, data: { status: "confirmed" } });
        }

        return updated;
    }

    // CALCULATE REMAINING BALANCE
    static async getRemainingBalance(bookingId: string) {
        const booking = await BookingRepo.findById(bookingId);
        if (!booking) throw new Error("Booking not found");

        // Use the server-computed, trustworthy Event.totalAmount (itemsTotal +
        // hostMarkupAmount + platformFeeAmount) rather than re-summing only the item
        // transactions — re-summing silently excluded Host markup and platform fee.
        const totalAgreed = (booking as any).event?.totalAmount ?? 0;

        const paidAmount = (booking.payments || [])
            .filter((p: any) => p.status === PaymentStatus.completed)
            .reduce((sum: number, p: any) => sum + p.amount, 0);

        return {
            totalAmount: totalAgreed,
            paidAmount,
            remainingBalance: Math.max(0, totalAgreed - paidAmount),
            currency: "PHP"
        };
    }

    // GET BOOKING PAYMENTS
    static async getBookingPayments(bookingId: string) {
        return PaymentRepo.getBookingPayments(bookingId);
    }
}
