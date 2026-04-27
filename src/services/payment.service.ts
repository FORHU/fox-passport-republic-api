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
        return PaymentRepo.getAllPayments(filters);
    }

    // GET PAYMENT BY ID
    static async getPaymentById(id: string) {
        const payment = await PaymentRepo.getPaymentById(id);
        if (!payment) {
            throw new Error("Payment not found");
        }
        return payment;
    }

    // GET PAYMENT BY TRANSACTION ID
    static async getPaymentByTransactionId(transactionId: string) {
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
        paymentStatus?: PaymentStatus;
    }) {
        let transactionId = this.generateTransactionId();
        while (await PaymentRepo.transactionIdExists(transactionId)) {
            transactionId = this.generateTransactionId();
        }

        return PaymentRepo.createPayment({
            bookingId: data.bookingId,
            amount: data.amount,
            currency: data.currency || "USD",
            method: data.method,
            paymentStatus: data.paymentStatus || PaymentStatus.pending,
            transactionId,
        });
    }

    // UPDATE PAYMENT
    static async updatePayment(
        id: string,
        data: Partial<{
            paymentStatus: PaymentStatus;
        }>
    ) {
        const exists = await PaymentRepo.paymentExists(id);
        if (!exists) {
            throw new Error("Payment not found");
        }

        return PaymentRepo.updatePayment(id, data);
    }

    // GET BOOKING PAYMENTS
    static async getBookingPayments(bookingId: string) {
        return PaymentRepo.getBookingPayments(bookingId);
    }

    // CREATE STRIPE PAYMENT INTENT
    static async createPaymentIntent(data: {
        amount: number;
        currency?: string;
        bookingId?: string;
        description?: string;
    }) {
        const amountInCentavos = Math.round(data.amount * 100);

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountInCentavos,
            currency: (data.currency || 'php').toLowerCase(),
            automatic_payment_methods: { enabled: true },
            metadata: {
                ...(data.bookingId ? { bookingId: data.bookingId } : {}),
                ...(data.description ? { description: data.description } : {}),
            },
        });

        return { clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id };
    }

    // HANDLE STRIPE WEBHOOK EVENT
    static async handleWebhookEvent(rawBody: Buffer, signature: string) {
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

        let event: Stripe.Event;
        try {
            event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
        } catch (err: any) {
            throw new Error(`Webhook signature verification failed: ${err.message}`);
        }

        if (event.type === 'payment_intent.succeeded') {
            const paymentIntent = event.data.object as Stripe.PaymentIntent;
            const bookingId = paymentIntent.metadata?.bookingId;

            if (bookingId) {
                await this.fulfillBookingPayment(bookingId, paymentIntent);
            }
        }

        return { received: true, type: event.type };
    }

    private static async fulfillBookingPayment(bookingId: string, paymentIntent: Stripe.PaymentIntent) {
        // Idempotency: skip if payment record already exists for this intent
        const existing = await PaymentRepo.transactionIdExists(paymentIntent.id);
        if (existing) return;

        const amountInPHP = paymentIntent.amount / 100;

        await prisma.$transaction([
            prisma.booking.update({
                where: { id: bookingId },
                data: { status: 'confirmed' },
            }),
            prisma.payment.create({
                data: {
                    bookingId,
                    amount: amountInPHP,
                    currency: paymentIntent.currency.toUpperCase(),
                    method: 'stripe',
                    status: PaymentStatus.completed,
                    transactionId: paymentIntent.id,
                },
            }),
        ]);
    }
}
