import PaymentRepo from "../repositories/payment.repository";
import crypto from "crypto";
import { PaymentStatus } from "@prisma/client";

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
        paymentMethod: string;
        paymentStatus?: PaymentStatus;
        gatewayResponse?: string;
    }) {
        // Generate unique transaction ID
        let transactionId = this.generateTransactionId();
        while (await PaymentRepo.transactionIdExists(transactionId)) {
            transactionId = this.generateTransactionId();
        }

        return PaymentRepo.createPayment({
            bookingId: data.bookingId,
            amount: data.amount,
            currency: data.currency || "USD",
            paymentMethod: data.paymentMethod,
            paymentStatus: data.paymentStatus || PaymentStatus.pending,
            transactionId,
            gatewayResponse: data.gatewayResponse,
        });
    }

    // UPDATE PAYMENT
    static async updatePayment(
        id: string,
        data: Partial<{
            paymentStatus: PaymentStatus;
            gatewayResponse: string;
        }>
    ) {
        // Check if payment exists
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
}

