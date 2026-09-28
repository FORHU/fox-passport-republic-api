import { sendServerError } from "../../utils/errors";
import { Request, Response } from "express";
import Joi from "joi";
import { Prisma } from "@prisma/client";
import PaymentSvc from "./payment.service";
import WebhookSvc from "./webhook.service";
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
      return sendServerError(res, e, { success: true });
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
      return sendServerError(res, e, { success: true });
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
      return sendServerError(res, e, { success: true });
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
      return sendServerError(res, e, { success: true });
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
      return sendServerError(res, e, { success: true });
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
      return sendServerError(res, e, { success: true });
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
      return sendServerError(res, e, { success: true });
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
      return sendServerError(res, e, { success: true });
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
    // HTTP: the raw body, the signature header, and the 400s above — plus
    // this one dispatch, because `PaymentSvc.handleStripeEvent`'s own switch
    // has no case for the new Checkout Session flow's event types (they fell
    // into its `default: console.log("Unhandled event type")` branch, which
    // is silent data loss: a citizen could pay and the payment would never
    // be confirmed). `payment_intent.succeeded` and everything else keeps
    // going through the legacy handler, untouched.
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      await WebhookSvc.processEventWithIdempotency(
        "stripe",
        event.id,
        event.type,
        event.data.object as unknown as Prisma.InputJsonValue,
        async () => {
          const providerReference =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : (session.payment_intent?.id ?? session.id);
          await WebhookSvc.handlePaymentSuccess(
            session.id,
            providerReference,
            // Stripe reports amount_total in the smallest currency unit;
            // the invoice/checkout amounts here are whole-currency, matching
            // how `StripeAdapter.createCheckout` sent it (`amount * 100`).
            (session.amount_total ?? 0) / 100,
            session.currency ?? "php",
          );
        },
      );
    } else if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      await WebhookSvc.processEventWithIdempotency(
        "stripe",
        event.id,
        event.type,
        event.data.object as unknown as Prisma.InputJsonValue,
        async () => {
          await WebhookSvc.handleCheckoutExpired(session.id);
        },
      );
    } else if (event.type === "payment_intent.succeeded") {
      // The legacy booking-payment flow. Wrapped like the events above so a
      // redelivery is skipped once handled, and a failure that leaves it
      // unprocessed is answered 5xx (the route's asyncHandler) so Stripe retries.
      await WebhookSvc.processEventWithIdempotency(
        "stripe",
        event.id,
        event.type,
        event.data.object as unknown as Prisma.InputJsonValue,
        () => PaymentSvc.handleStripeEvent(event),
      );
    } else {
      await PaymentSvc.handleStripeEvent(event);
    }

    res.json({ received: true });
  }
}
