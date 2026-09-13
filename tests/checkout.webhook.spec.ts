import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { prisma } from "../src/utils/prisma";

/**
 * Proves `PaymentController.handleWebhook`'s dispatch, added to route the new
 * Checkout Session flow's events to `WebhookSvc` instead of falling silently
 * into `PaymentSvc.handleStripeEvent`'s `default: console.log("Unhandled
 * event type")` branch — which is what was happening before this file
 * existed, and is why a citizen's payment could complete at Stripe and never
 * be confirmed here.
 *
 * `constructEvent` is mocked rather than the whole request signed, so each
 * test controls exactly which Stripe event type and payload reaches the
 * controller without needing a real webhook secret or signature.
 */
let mockEvent: { id: string; type: string; data: { object: any } } | null =
  null;

vi.mock("stripe", () => {
  return {
    default: class {
      webhooks = {
        constructEvent: vi.fn(() => mockEvent),
      };
    },
  };
});

// Imported after the mock so the controller's own `new Stripe(...)` picks it up.
import app from "../src/app";
import InvoiceSvc from "../src/modules/payment/invoice.service";
import PaymentSvc from "../src/modules/payment/payment.service";
import WebhookSvc from "../src/modules/payment/webhook.service";

const postWebhook = () =>
  request(app)
    .post("/api/v1/payments/webhook")
    .set("stripe-signature", "test-signature")
    .set("Content-Type", "application/json")
    .send(JSON.stringify({ type: mockEvent?.type }));

describe("Stripe webhook dispatch — new Checkout Session flow vs legacy PaymentIntent flow", () => {
  let testUser: any;

  beforeAll(async () => {
    testUser = await prisma.user.upsert({
      where: { email: "checkout_webhook_test@example.com" },
      update: {},
      create: {
        email: "checkout_webhook_test@example.com",
        password: "password123",
        name: "Checkout Webhook Test User",
      },
    });
  });

  afterAll(async () => {
    await prisma.checkout.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.invoiceItem.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.paymentProviderEvent.deleteMany({});
  });

  it("checkout.session.completed marks the invoice paid and the checkout completed", async () => {
    const invoice = await InvoiceSvc.createInvoice({
      payerId: testUser.id,
      items: [
        {
          amount: 1000,
          description: "Webhook dispatch test — completed",
          sourceType: "event_asset_transaction" as any,
          sourceId: "wh_completed_src",
        },
      ],
    });
    const checkout = await prisma.checkout.create({
      data: {
        invoiceId: invoice.id,
        provider: "stripe",
        providerSessionId: "cs_wh_completed",
      },
    });

    mockEvent = {
      id: "evt_completed_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: checkout.providerSessionId,
          payment_intent: "pi_wh_completed",
          amount_total: invoice.grossAmount.toNumber() * 100,
          currency: "php",
        },
      },
    };

    const res = await postWebhook();
    expect(res.status).toBe(200);

    const updatedInvoice = await prisma.invoice.findUnique({
      where: { id: invoice.id },
    });
    const updatedCheckout = await prisma.checkout.findUnique({
      where: { id: checkout.id },
    });
    const payment = await prisma.payment.findUnique({
      where: { providerReference: "pi_wh_completed" },
    });

    expect(updatedInvoice?.status).toBe("paid");
    expect(updatedCheckout?.status).toBe("completed");
    expect(payment?.status).toBe("paid");
  });

  it("the same checkout.session.completed delivered twice still creates exactly one Payment row", async () => {
    const invoice = await InvoiceSvc.createInvoice({
      payerId: testUser.id,
      items: [
        {
          amount: 700,
          description: "Webhook dispatch test — duplicate delivery",
          sourceType: "event_asset_transaction" as any,
          sourceId: "wh_dup_src",
        },
      ],
    });
    const checkout = await prisma.checkout.create({
      data: {
        invoiceId: invoice.id,
        provider: "stripe",
        providerSessionId: "cs_wh_dup",
      },
    });

    mockEvent = {
      id: "evt_dup_1", // same event id both times — this is what processEventWithIdempotency keys on
      type: "checkout.session.completed",
      data: {
        object: {
          id: checkout.providerSessionId,
          payment_intent: "pi_wh_dup",
          amount_total: invoice.grossAmount.toNumber() * 100,
          currency: "php",
        },
      },
    };

    const successSpy = vi.spyOn(WebhookSvc, "handlePaymentSuccess");

    await postWebhook();
    await postWebhook();

    // The direct proof: the processor behind processEventWithIdempotency's
    // guard only actually ran once. Asserting on the end DB state alone
    // (payments.length === 1) doesn't distinguish "the guard skipped the
    // second delivery" from "the handler ran twice but its own upsert-by-
    // providerReference happened to converge to one row anyway" — this
    // does.
    expect(successSpy).toHaveBeenCalledTimes(1);
    successSpy.mockRestore();

    const payments = await prisma.payment.findMany({
      where: { providerReference: "pi_wh_dup" },
    });
    expect(payments.length).toBe(1);
    expect(payments[0].status).toBe("paid");

    const invoiceAfter = await prisma.invoice.findUnique({
      where: { id: invoice.id },
    });
    expect(invoiceAfter?.status).toBe("paid"); // not "advanced" a second time into some other state

    const providerEvent = await prisma.paymentProviderEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider: "stripe",
          providerEventId: mockEvent.id,
        },
      },
    });
    expect(providerEvent?.processed).toBe(true);
  });

  it("checkout.session.expired marks only the checkout expired, leaving the invoice and payments untouched", async () => {
    const invoice = await InvoiceSvc.createInvoice({
      payerId: testUser.id,
      items: [
        {
          amount: 500,
          description: "Webhook dispatch test — expired",
          sourceType: "event_asset_transaction" as any,
          sourceId: "wh_expired_src",
        },
      ],
    });
    const checkout = await prisma.checkout.create({
      data: {
        invoiceId: invoice.id,
        provider: "stripe",
        providerSessionId: "cs_wh_expired",
      },
    });

    mockEvent = {
      id: "evt_expired_1",
      type: "checkout.session.expired",
      data: { object: { id: checkout.providerSessionId } },
    };

    const res = await postWebhook();
    expect(res.status).toBe(200);

    const updatedInvoice = await prisma.invoice.findUnique({
      where: { id: invoice.id },
    });
    const updatedCheckout = await prisma.checkout.findUnique({
      where: { id: checkout.id },
    });
    const payments = await prisma.payment.findMany({
      where: { invoiceId: invoice.id },
    });

    expect(updatedCheckout?.status).toBe("expired");
    expect(updatedInvoice?.status).toBe("pending"); // untouched — the payer can still retry
    expect(payments.length).toBe(0);
  });

  it("checkout.session.expired on an already-completed checkout is a no-op", async () => {
    const invoice = await InvoiceSvc.createInvoice({
      payerId: testUser.id,
      items: [
        {
          amount: 300,
          description: "Webhook dispatch test — expired-after-completed",
          sourceType: "event_asset_transaction" as any,
          sourceId: "wh_expired_after_completed_src",
        },
      ],
    });
    const checkout = await prisma.checkout.create({
      data: {
        invoiceId: invoice.id,
        provider: "stripe",
        providerSessionId: "cs_wh_expired_after_completed",
        status: "completed",
      },
    });

    mockEvent = {
      id: "evt_expired_after_completed_1",
      type: "checkout.session.expired",
      data: { object: { id: checkout.providerSessionId } },
    };

    const res = await postWebhook();
    expect(res.status).toBe(200);

    const updatedCheckout = await prisma.checkout.findUnique({
      where: { id: checkout.id },
    });
    expect(updatedCheckout?.status).toBe("completed"); // not overwritten to "expired"
  });

  it("payment_intent.succeeded (the legacy booking-payment flow) still dispatches to PaymentSvc", async () => {
    const spy = vi.spyOn(PaymentSvc, "handleStripeEvent");

    mockEvent = {
      id: "evt_legacy_1",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_legacy",
          amount: 100000,
          currency: "php",
          metadata: { bookingId: "nonexistent-booking-id" },
        },
      },
    };

    const res = await postWebhook();

    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith(mockEvent);

    spy.mockRestore();
  });

  it("an unrelated event type (account.updated) is untouched by the new branching", async () => {
    const spy = vi.spyOn(PaymentSvc, "handleStripeEvent");

    mockEvent = {
      id: "evt_account_1",
      type: "account.updated",
      data: { object: { id: "acct_test" } },
    };

    const res = await postWebhook();

    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith(mockEvent);

    spy.mockRestore();
  });
});
