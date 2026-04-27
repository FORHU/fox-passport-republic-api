import { Request, Response } from "express";
import Joi from "joi";
import PaymentSvc from "../services/payment.service";

export default class PaymentController {
    // GET ALL PAYMENTS
    static async getAllPayments(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                bookingId: Joi.string().uuid().optional(),
                paymentStatus: Joi.string().optional(),
            });

            const { error, value } = schema.validate(req.query);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const payments = await PaymentSvc.getAllPayments(value);
            return res.status(200).json({
                success: true,
                count: payments.length,
                data: payments,
            });
        } catch (error: any) {
            console.error("Get all payments error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch payments",
            });
        }
    }

    // GET PAYMENT BY ID
    static async getPaymentById(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                id: Joi.string().uuid().required(),
            });

            const { error, value } = schema.validate(req.params);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const payment = await PaymentSvc.getPaymentById(value.id);
            return res.status(200).json({
                success: true,
                data: payment,
            });
        } catch (error: any) {
            console.error("Get payment by ID error:", error);
            if (error.message === "Payment not found") {
                return res.status(404).json({ success: false, message: error.message });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch payment",
            });
        }
    }

    // GET PAYMENT BY TRANSACTION ID
    static async getPaymentByTransactionId(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                transactionId: Joi.string().required(),
            });

            const { error, value } = schema.validate(req.params);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const payment = await PaymentSvc.getPaymentByTransactionId(value.transactionId);
            return res.status(200).json({
                success: true,
                data: payment,
            });
        } catch (error: any) {
            console.error("Get payment by transaction ID error:", error);
            if (error.message === "Payment not found") {
                return res.status(404).json({ success: false, message: error.message });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch payment",
            });
        }
    }

    // CREATE PAYMENT (manual record)
    static async createPayment(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                bookingId: Joi.string().uuid().required(),
                amount: Joi.number().min(0).required(),
                currency: Joi.string().length(3).uppercase().optional(),
                paymentMethod: Joi.string().required(),
                paymentStatus: Joi.string().valid("pending", "completed", "failed", "refunded").optional(),
                gatewayResponse: Joi.string().optional(),
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const payment = await PaymentSvc.createPayment(value);
            return res.status(201).json({
                success: true,
                message: "Payment created successfully",
                data: payment,
            });
        } catch (error: any) {
            console.error("Create payment error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to create payment",
            });
        }
    }

    // UPDATE PAYMENT
    static async updatePayment(req: Request, res: Response) {
        try {
            const paramsSchema = Joi.object({
                id: Joi.string().uuid().required(),
            });

            const { error: paramsError, value: params } = paramsSchema.validate(req.params);
            if (paramsError) {
                return res.status(400).json({ message: paramsError.message });
            }

            const bodySchema = Joi.object({
                paymentStatus: Joi.string().valid("pending", "completed", "failed", "refunded").optional(),
                gatewayResponse: Joi.string().optional(),
            });

            const { error: bodyError, value: body } = bodySchema.validate(req.body);
            if (bodyError) {
                return res.status(400).json({ message: bodyError.message });
            }

            const payment = await PaymentSvc.updatePayment(params.id, body);
            return res.status(200).json({
                success: true,
                message: "Payment updated successfully",
                data: payment,
            });
        } catch (error: any) {
            console.error("Update payment error:", error);
            if (error.message === "Payment not found") {
                return res.status(404).json({ success: false, message: error.message });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to update payment",
            });
        }
    }

    // GET BOOKING PAYMENTS
    static async getBookingPayments(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                bookingId: Joi.string().uuid().required(),
            });

            const { error, value } = schema.validate(req.params);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const payments = await PaymentSvc.getBookingPayments(value.bookingId);
            return res.status(200).json({
                success: true,
                count: payments.length,
                data: payments,
            });
        } catch (error: any) {
            console.error("Get booking payments error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch booking payments",
            });
        }
    }

    // CREATE STRIPE PAYMENT INTENT
    static async createPaymentIntent(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                amount: Joi.number().min(1).required(),
                currency: Joi.string().length(3).optional().default('php'),
                bookingId: Joi.string().uuid().optional(),
                description: Joi.string().optional(),
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({ success: false, message: error.message });
            }

            const result = await PaymentSvc.createPaymentIntent(value);
            return res.status(200).json({
                success: true,
                data: result,
            });
        } catch (error: any) {
            console.error("Create payment intent error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to create payment intent",
            });
        }
    }

    // STRIPE WEBHOOK HANDLER
    static async handleWebhook(req: Request, res: Response) {
        const signature = req.headers['stripe-signature'];
        if (!signature) {
            return res.status(400).json({ success: false, message: "Missing stripe-signature header" });
        }

        try {
            const result = await PaymentSvc.handleWebhookEvent(req.body as Buffer, signature as string);
            return res.status(200).json(result);
        } catch (error: any) {
            console.error("Webhook error:", error);
            return res.status(400).json({ success: false, message: error.message });
        }
    }
}
