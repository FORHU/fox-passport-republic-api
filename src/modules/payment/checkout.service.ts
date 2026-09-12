import { prisma } from "../../utils/prisma";
import { PaymentProvider } from "./providers/payment-provider.interface";
import { StripeAdapter } from "./providers/stripe-adapter";
import { FRONTEND_URL } from "../../config";

export default class CheckoutSvc {
  // Use a factory or dependency injection in the future. Hardcoded to StripeAdapter for V1.
  private static provider: PaymentProvider = new StripeAdapter();

  /**
   * Creates a checkout session for a given invoice.
   * Ensures only one active checkout exists for the invoice.
   */
  static async createCheckout(invoiceId: string) {
    return prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { checkouts: true }
      });

      if (!invoice) throw new Error("Invoice not found");
      if (invoice.status === "paid") throw new Error("Invoice is already paid");
      if (invoice.status === "cancelled") throw new Error("Invoice is cancelled");

      // Expire any existing active checkouts
      const activeCheckouts = invoice.checkouts.filter(c => c.status === "active");
      for (const c of activeCheckouts) {
        await tx.checkout.update({
          where: { id: c.id },
          data: { status: "expired" }
        });
      }

      // Prepare URLs
      const successUrl = `${FRONTEND_URL}/checkout/success?invoiceId=${invoiceId}`;
      const cancelUrl = `${FRONTEND_URL}/checkout/cancel?invoiceId=${invoiceId}`;

      // Call Provider
      const sessionData = await this.provider.createCheckout(
        invoiceId,
        invoice.grossAmount.toNumber(),
        invoice.currency,
        successUrl,
        cancelUrl
      );

      // Save Checkout
      const checkout = await tx.checkout.create({
        data: {
          invoiceId,
          provider: "stripe",
          providerSessionId: sessionData.providerSessionId,
          status: "active"
        }
      });

      return {
        checkoutId: checkout.id,
        url: sessionData.url
      };
    });
  }

  static async getCheckout(checkoutId: string) {
    const checkout = await prisma.checkout.findUnique({
      where: { id: checkoutId }
    });
    if (!checkout) throw new Error("Checkout not found");
    return checkout;
  }

  static async expireCheckout(checkoutId: string) {
    const checkout = await prisma.checkout.findUnique({
      where: { id: checkoutId }
    });
    if (!checkout) throw new Error("Checkout not found");
    if (checkout.status !== "active") return checkout;

    return prisma.checkout.update({
      where: { id: checkoutId },
      data: { status: "expired" }
    });
  }
}
