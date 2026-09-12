import Stripe from "stripe";
import { STRIPE_SECRET_KEY } from "../../../config";
import { CheckoutSessionData, PaymentProvider, PaymentStatusData, RefundData } from "./payment-provider.interface";

const stripe = new Stripe(STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-08-27.basil",
});

export class StripeAdapter implements PaymentProvider {
  async createCheckout(
    invoiceId: string,
    amount: number,
    currency: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<CheckoutSessionData> {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
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
    });

    if (!session.url) {
      throw new Error("Failed to create Stripe checkout session URL");
    }

    return {
      providerSessionId: session.id,
      url: session.url,
    };
  }

  async getPaymentStatus(providerSessionId: string): Promise<PaymentStatusData> {
    const session = await stripe.checkout.sessions.retrieve(providerSessionId);

    let status: PaymentStatusData["status"] = "pending";

    if (session.payment_status === "paid") {
      status = "paid";
    } else if (session.status === "expired") {
      status = "failed";
    }

    const providerReference = session.payment_intent as string | undefined;

    return {
      status,
      providerReference,
    };
  }

  async refund(providerReference: string, amount?: number): Promise<RefundData> {
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

  verifyWebhook(payload: any, signature: string): any {
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
    return stripe.webhooks.constructEvent(payload, signature, endpointSecret);
  }
}
