import { prisma, AppTransactionClient } from "../../utils/prisma";
import { PaymentProvider } from "./providers/payment-provider.interface";
import { StripeAdapter } from "./providers/stripe-adapter";
import { FRONTEND_URL } from "../../config";

export default class CheckoutSvc {
  // Use a factory or dependency injection in the future. Hardcoded to StripeAdapter for V1.
  private static provider: PaymentProvider = new StripeAdapter();

  /**
   * DB-only half of checkout creation — no provider (Stripe) call. Creates
   * the Checkout row with no `providerSessionId` yet, inside the caller's
   * own transaction. Split out specifically so a caller (EventCheckoutSvc)
   * can run this alongside its booking lock, availability revalidation, and
   * invoice creation as ONE atomic unit, and only call the real payment
   * provider — `initiateProviderSession` below — strictly after that
   * transaction has committed. Calling Stripe from inside a still-open DB
   * transaction was the previous shape of this method; that held a
   * transaction open across a network round-trip and meant a Stripe session
   * could be created for an Invoice that then failed to commit.
   */
  static async createPendingCheckout(
    tx: AppTransactionClient,
    invoiceId: string,
  ) {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: { checkouts: true },
    });

    if (!invoice) throw new Error("Invoice not found");
    if (invoice.status === "paid") throw new Error("Invoice is already paid");
    if (invoice.status === "cancelled")
      throw new Error("Invoice is cancelled");

    const activeCheckouts = invoice.checkouts.filter(
      (c) => c.status === "active",
    );
    for (const c of activeCheckouts) {
      await tx.checkout.update({
        where: { id: c.id },
        data: { status: "expired" },
      });
    }

    return tx.checkout.create({
      data: {
        invoiceId,
        provider: "stripe",
        providerSessionId: null,
        status: "active",
      },
    });
  }

  /**
   * The provider (Stripe) half — called only after the transaction that
   * created `checkout` has committed. `checkout.id` is passed as the
   * provider's own idempotency key: a retried call (e.g. after this
   * process crashes between the Stripe response and persisting it) returns
   * Stripe's original session rather than creating a second one, because
   * `checkout.id` is created exactly once per invoice by the transaction
   * above.
   *
   * On provider failure, the Checkout row is marked `failed` (not left
   * dangling at `active` with no session) so a retry has a clear signal to
   * act on; the caller decides whether/how to retry.
   */
  static async initiateProviderSession(
    checkoutId: string,
    invoiceId: string,
    amount: number,
    currency: string,
  ) {
    const successUrl = `${FRONTEND_URL}/checkout/success?invoiceId=${invoiceId}`;
    const cancelUrl = `${FRONTEND_URL}/checkout/cancel?invoiceId=${invoiceId}`;

    try {
      const sessionData = await this.provider.createCheckout(
        invoiceId,
        amount,
        currency,
        successUrl,
        cancelUrl,
        checkoutId, // Stripe idempotency key
      );

      const checkout = await prisma.checkout.update({
        where: { id: checkoutId },
        data: { providerSessionId: sessionData.providerSessionId },
      });

      return { checkoutId: checkout.id, url: sessionData.url, status: checkout.status };
    } catch (err) {
      await prisma.checkout.update({
        where: { id: checkoutId },
        data: { status: "failed" },
      });
      throw err;
    }
  }

  /**
   * Reconciliation for the "request succeeded but the response was lost"
   * case: this process called Stripe, Stripe processed it, but we crashed
   * (or the connection dropped) before persisting `providerSessionId`. Such
   * a Checkout is stuck at `active` with no session — indistinguishable
   * from "Stripe was never contacted" by looking at our own row alone.
   *
   * The fix is not to try to look up what happened — it's to re-issue the
   * IDENTICAL create call with the same idempotency key (`checkout.id`).
   * Stripe's own idempotency guarantee returns the original session if one
   * was already created, or creates a fresh one if the first attempt never
   * actually reached Stripe. Either way, no duplicate session and no
   * duplicate charge is possible.
   *
   * Webhook/state-conflict handling: `handlePaymentSuccess` only ever finds
   * a Checkout `WHERE providerSessionId = ...`, so it structurally cannot
   * race ahead of reconciliation — a webhook can't act on a session our own
   * row doesn't yet know about. The remaining case (this call and a
   * same-moment webhook both touching the row) is naturally safe: both
   * would resolve to the same Stripe session id, and writing an identical
   * value twice is not a conflict.
   */
  static async reconcileStaleCheckouts(staleSinceMs = 5 * 60 * 1000) {
    const cutoff = new Date(Date.now() - staleSinceMs);
    const stale = await prisma.checkout.findMany({
      where: {
        status: "active",
        providerSessionId: null,
        createdAt: { lt: cutoff },
      },
      include: { invoice: true },
    });

    const results: { checkoutId: string; outcome: "recovered" | "failed" }[] = [];
    for (const checkout of stale) {
      try {
        await this.initiateProviderSession(
          checkout.id,
          checkout.invoiceId,
          checkout.invoice.grossAmount.toNumber(),
          checkout.invoice.currency,
        );
        results.push({ checkoutId: checkout.id, outcome: "recovered" });
      } catch {
        // Already marked `failed` by initiateProviderSession's own catch —
        // nothing further to do here besides reporting it.
        results.push({ checkoutId: checkout.id, outcome: "failed" });
      }
    }
    return results;
  }

  /**
   * Convenience wrapper for callers that don't need the atomicity
   * `createPendingCheckout`/`initiateProviderSession` gives EventCheckoutSvc
   * — e.g. partnership checkout, which creates its Invoice separately and
   * just needs "create a checkout for this invoice" as one call. Not used
   * by the Phase B marketplace booking-checkout path.
   */
  static async createCheckout(invoiceId: string) {
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new Error("Invoice not found");

    const checkout = await prisma.$transaction((tx) =>
      this.createPendingCheckout(tx, invoiceId),
    );

    return this.initiateProviderSession(
      checkout.id,
      invoiceId,
      invoice.grossAmount.toNumber(),
      invoice.currency,
    );
  }

  static async getCheckout(checkoutId: string) {
    const checkout = await prisma.checkout.findUnique({
      where: { id: checkoutId },
    });
    if (!checkout) throw new Error("Checkout not found");
    return checkout;
  }

  static async expireCheckout(checkoutId: string) {
    const checkout = await prisma.checkout.findUnique({
      where: { id: checkoutId },
    });
    if (!checkout) throw new Error("Checkout not found");
    if (checkout.status !== "active") return checkout;

    return prisma.checkout.update({
      where: { id: checkoutId },
      data: { status: "expired" },
    });
  }
}
