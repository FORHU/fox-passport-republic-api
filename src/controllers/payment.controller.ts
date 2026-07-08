import { Request, Response } from "express";
import Joi from "joi";
import PaymentSvc from "../services/payment.service";
import StripeConnectSvc from "../services/stripe-connect.service";
import Stripe from "stripe";
import { prisma } from "../utils/prisma";
import { PaymentStatus } from "@prisma/client";
import RefundSvc from "../services/refund.service";

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

      const payment = await PaymentSvc.getPaymentByTransactionId(
        value.transactionId,
      );
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
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (err: any) {
      console.error(`❌ Webhook signature verification failed: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
      case "payment_intent.succeeded":
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const bookingId = paymentIntent.metadata.bookingId;

        console.log(
          `✅ PaymentIntent succeeded: ${paymentIntent.id} for booking ${bookingId}`,
        );

        try {
          // Find the pending payment for this booking
          const payments = await PaymentSvc.getBookingPayments(bookingId);
          const pendingPayment = payments.find(
            (p) => p.status === PaymentStatus.pending,
          );

          if (pendingPayment) {
            await PaymentSvc.updatePayment(pendingPayment.id, {
              paymentStatus: PaymentStatus.completed,
            });

            // Update transaction ID to Stripe's ID
            await prisma.payment.update({
              where: { id: pendingPayment.id },
              data: { transactionId: paymentIntent.id },
            });
            // Also link the Stripe PaymentIntent id to the Booking
            try {
              await prisma.booking.update({
                where: { id: bookingId },
                data: { stripePaymentId: paymentIntent.id },
              });
            } catch (err) {
              console.error(
                "Failed to set booking.stripePaymentId in webhook:",
                err,
              );
            }
          } else {
            // If no pending payment found, create a completed one
            await PaymentSvc.createPayment({
              bookingId,
              amount: paymentIntent.amount / 100,
              currency: paymentIntent.currency.toUpperCase(),
              method: "stripe",
              paymentType: "full",
              paymentStatus: PaymentStatus.completed,
              transactionId: paymentIntent.id,
            });
            // Ensure booking.stripePaymentId is set (createPayment will also attempt this)
            try {
              await prisma.booking.update({
                where: { id: bookingId },
                data: { stripePaymentId: paymentIntent.id },
              });
            } catch (err) {
              console.error(
                "Failed to set booking.stripePaymentId after createPayment in webhook:",
                err,
              );
            }
          }
        } catch (error) {
          console.error("Error updating payment via webhook:", error);
        }
        break;

      case "payment_intent.payment_failed":
        const failedIntent = event.data.object as Stripe.PaymentIntent;
        console.log(`❌ PaymentIntent failed: ${failedIntent.id}`);
        break;

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        if (charge.refunded && charge.payment_intent) {
          const piId =
            typeof charge.payment_intent === "string"
              ? charge.payment_intent
              : charge.payment_intent.id;
          const payment = await prisma.payment.findFirst({
            where: { transactionId: piId },
          });
          if (payment) {
            await prisma.payment.update({
              where: { id: payment.id },
              data: { status: PaymentStatus.refunded },
            });
          }
        }
        break;
      }

      case "refund.updated":
        const refundUpdated = event.data.object as Stripe.Refund;
        if (refundUpdated.status === "failed") {
          await RefundSvc.handleWebhookRefundFailed(event);
        } else if (refundUpdated.status === "succeeded") {
          await RefundSvc.handleWebhookRefundSucceeded(event);
        }
        break;

      case "account.updated":
        // Keeps User.stripeChargesEnabled/stripePayoutsEnabled/stripeOnboardingComplete
        // in sync with the connected account's real state. See
        // docs/adr/0002-stripe-connect-payouts.md. Deployment note: the Stripe
        // webhook endpoint must also be subscribed to this event type.
        try {
          const account = event.data.object as Stripe.Account;
          await StripeConnectSvc.handleAccountUpdated(account);
          console.log(`✅ account.updated synced for ${account.id}`);
        } catch (error) {
          console.error("Error syncing account.updated via webhook:", error);
        }
        break;

      default:
        console.log(`ℹ️ Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  }
}
