import { Request, Response } from "express";
import Joi from "joi";
import PaymentSvc from "./payment.service";
import Stripe from "stripe";

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
    } catch (e: unknown) {
      const error = e as Error;
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
    } catch (e: unknown) {
      const error = e as Error;
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

      const payment = await PaymentSvc.getPaymentByTransactionId(
        value.transactionId,
      );
      return res.status(200).json({
        success: true,
        data: payment,
      });
    } catch (e: unknown) {
      const error = e as Error;
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
        paymentType: Joi.string().valid("deposit", "full").required(),
        paymentStatus: Joi.string()
          .valid("pending", "completed", "failed", "refunded", "cancelled")
          .optional(),
        gatewayResponse: Joi.string().optional(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ message: error.message });
      }

      const { paymentMethod, ...rest } = value;
      const payment = await PaymentSvc.createPayment({
        ...rest,
        method: paymentMethod,
      });
      return res.status(201).json({
        success: true,
        message: "Payment created successfully",
        data: payment,
      });
    } catch (e: unknown) {
      const error = e as Error;
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

      const { error: paramsError, value: params } = paramsSchema.validate(
        req.params,
      );
      if (paramsError) {
        return res.status(400).json({ message: paramsError.message });
      }

      const bodySchema = Joi.object({
        paymentStatus: Joi.string()
          .valid("pending", "completed", "failed", "refunded", "cancelled")
          .optional(),
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
    } catch (e: unknown) {
      const error = e as Error;
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
    } catch (e: unknown) {
      const error = e as Error;
      console.error("Get booking payments error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch booking payments",
      });
    }
  }

  // GET REMAINING BALANCE
  static async getRemainingBalance(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        bookingId: Joi.string().uuid().required(),
      });

      const { error, value } = schema.validate(req.params);
      if (error) {
        return res.status(400).json({ message: error.message });
      }

      const balance = await PaymentSvc.getRemainingBalance(value.bookingId);
      return res.status(200).json({
        success: true,
        data: balance,
      });
    } catch (e: unknown) {
      const error = e as Error;
      console.error("Get remaining balance error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to calculate balance",
      });
    }
  }

  // CREATE STRIPE PAYMENT INTENT
  static async createPaymentIntent(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        amount: Joi.number().min(1).required(),
        currency: Joi.string().length(3).uppercase().optional(),
        bookingId: Joi.string().uuid().required(),
        description: Joi.string().optional(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ message: error.message });
      }

      const intentData = await PaymentSvc.createPaymentIntent(value);
      return res.status(200).json({
        success: true,
        data: intentData,
      });
    } catch (e: unknown) {
      const error = e as Error;
      console.error("Create payment intent error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to create payment intent",
      });
    }
  }

  // HANDLE STRIPE WEBHOOK
  static async handleWebhook(req: Request, res: Response) {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
      console.warn(
        "⚠️ Webhook Warning: Missing stripe-signature or webhook secret",
      );
      return res.status(400).send("Webhook Error: Missing signature or secret");
    }

    let event: Stripe.Event;

    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
        apiVersion: "2025-08-27.basil",
      });
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (e: unknown) {
      const err = e as Error;
      console.error(`❌ Webhook signature verification failed: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Everything the event means is the service's business - see
    // `docs/REDIS-PLAN.md` §0b. What stays here is the part that is genuinely
    // HTTP: the raw body, the signature header, and the 400s above.
    await PaymentSvc.handleStripeEvent(event);

    res.json({ received: true });
  }
}
