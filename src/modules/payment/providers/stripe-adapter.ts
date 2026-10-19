import Stripe from "stripe";
import { STRIPE_SECRET_KEY } from "../../../config";
import {
  CheckoutSessionData,
  PaymentProvider,
  PaymentStatusData,
  RefundData,
} from "./payment-provider.interface";

const stripe = new Stripe(STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-08-27.basil",
});

export class StripeAdapter implements PaymentProvider {
  async createCheckout(
    invoiceId: string,
    amount: number,
    currency: string,
    successUrl: string,
    cancelUrl: string,
    idempotencyKey?: string,
    allowedMethods?: string[],
  ): Promise<CheckoutSessionData> {
    const sessionPayload: Stripe.Checkout.SessionCreateParams = {
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `Invoice ${invoiceId}`,
            },
            // Stripe expects amount in smallest currency unit (e.g., cents for PHP/USD)
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: invoiceId,
    };

    // If explicit payment methods are specified, pass them;
    // otherwise omitting payment_method_types lets Stripe Checkout dynamically
    // present all multi-choice payment methods configured in the dashboard (Cards, GCash, Maya, GrabPay, etc.)
    if (allowedMethods && allowedMethods.length > 0) {
      sessionPayload.payment_method_types =
        allowedMethods as Stripe.Checkout.SessionCreateParams.PaymentMethodType[];
    }

    const session = await stripe.checkout.sessions.create(
      sessionPayload,
      idempotencyKey ? { idempotencyKey } : undefined,
    );

    if (!session.url) {
      throw new Error("Failed to create Stripe checkout session URL");
    }

    return {
      providerSessionId: session.id,
      url: session.url,
      allowedMethods: allowedMethods || ["automatic_multi_choice"],
    };
  }

  async getPaymentStatus(
    providerSessionId: string,
  ): Promise<PaymentStatusData> {
    const session = await stripe.checkout.sessions.retrieve(providerSessionId, {
      expand: ["payment_intent"],
    });

    let status: PaymentStatusData["status"] = "pending";

    if (session.payment_status === "paid") {
      status = "paid";
    } else if (session.status === "expired") {
      status = "failed";
    }

    const intent =
      typeof session.payment_intent === "object" &&
      session.payment_intent !== null
        ? (session.payment_intent as Stripe.PaymentIntent)
        : null;

    const providerReference =
      intent?.id ?? (session.payment_intent as string | undefined);
    const paymentMethod =
      intent?.payment_method_types?.[0] || session.payment_method_types?.[0];

    return {
      status,
      providerReference,
      paymentMethod,
    };
  }

  async refund(
    providerReference: string,
    amount?: number,
  ): Promise<RefundData> {
    const refundParams: Stripe.RefundCreateParams = {
      payment_intent: providerReference,
    };

    if (amount) {
      refundParams.amount = Math.round(amount * 100);
    }

    const refund = await stripe.refunds.create(refundParams);

    let status: RefundData["status"] = "pending";
    if (refund.status === "succeeded") status = "succeeded";
    else if (refund.status === "failed") status = "failed";

    return {
      providerReference: refund.id,
      status,
    };
  }

  verifyWebhook(payload: string | Buffer, signature: string): Stripe.Event {
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
    return stripe.webhooks.constructEvent(payload, signature, endpointSecret);
  }
}
