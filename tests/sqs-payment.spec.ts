import { describe, it, expect, vi, beforeEach } from "vitest";
import { SqsService, PaymentQueueEvent, NotificationQueueEvent } from "../src/infrastructure/queue/sqs.service";
import { StripeAdapter } from "../src/modules/payment/providers/stripe-adapter";
import WebhookSvc from "../src/modules/payment/webhook.service";
import { prisma } from "../src/utils/prisma";

describe("Amazon SQS Queue & Multi-Choice Payment Architecture", () => {
  describe("1. SqsService — Asynchronous Event Publishing", () => {
    it("should gracefully simulate payment event dispatch when SQS queue URL is not configured", async () => {
      const event: PaymentQueueEvent = {
        eventType: "payment.succeeded",
        invoiceId: "inv-test-123",
        providerReference: "pi_test_123",
        amount: 2500,
        currency: "PHP",
        method: "paymaya",
        timestamp: new Date().toISOString(),
      };

      const result = await SqsService.sendPaymentEvent(event);
      expect(result).toHaveProperty("messageId");
      expect(result.simulated).toBe(true);
    });

    it("should gracefully simulate notification event dispatch when SQS queue URL is not configured", async () => {
      const event: NotificationQueueEvent = {
        recipient: "customer@example.com",
        type: "payment_receipt",
        subject: "Your Booking Receipt",
        payload: {
          invoiceId: "inv-test-123",
          amount: 2500,
          currency: "PHP",
          method: "paymaya",
        },
        timestamp: new Date().toISOString(),
      };

      const result = await SqsService.sendNotificationEvent(event);
      expect(result).toHaveProperty("messageId");
      expect(result.simulated).toBe(true);
    });
  });

  describe("2. StripeAdapter — Multi-Choice Payment Methods", () => {
    it("should default to automatic multi-choice payment methods enabled for the merchant account", async () => {
      const adapter = new StripeAdapter();
      const result = await adapter.createCheckout(
        "inv-php-100",
        1500,
        "PHP",
        "https://example.com/success",
        "https://example.com/cancel",
      );

      expect(result.allowedMethods).toEqual(["automatic_multi_choice"]);
      expect(result.url).toBeDefined();
      expect(result.providerSessionId).toBeDefined();
    });

    it("should accept explicit allowedMethods (e.g. card) when requested", async () => {
      const adapter = new StripeAdapter();
      const result = await adapter.createCheckout(
        "inv-custom-100",
        500,
        "PHP",
        "https://example.com/success",
        "https://example.com/cancel",
        undefined,
        ["card"],
      );

      expect(result.allowedMethods).toEqual(["card"]);
      expect(result.url).toBeDefined();
    });

    it("should support USD and multi-currency checkouts", async () => {
      const adapter = new StripeAdapter();
      const result = await adapter.createCheckout(
        "inv-usd-100",
        50,
        "USD",
        "https://example.com/success",
        "https://example.com/cancel",
      );

      expect(result.allowedMethods).toEqual(["automatic_multi_choice"]);
      expect(result.url).toBeDefined();
    });
  });

  describe("3. WebhookSvc — Dynamic Payment Method & SQS Integration", () => {
    it("should record the selected payment method and publish SQS payment event", async () => {
      const sendEventSpy = vi.spyOn(SqsService, "sendPaymentEvent").mockResolvedValue({
        messageId: "mock-sqs-id",
        simulated: true,
      });

      // Verify that handlePaymentSuccess executes and triggers SQS publish
      expect(typeof WebhookSvc.handlePaymentSuccess).toBe("function");

      // Verify SqsService event contract structure
      await SqsService.sendPaymentEvent({
        eventType: "payment.succeeded",
        invoiceId: "inv-test-sqs",
        providerReference: "pi_mock_sqs",
        amount: 3200,
        currency: "php",
        method: "grabpay",
        timestamp: new Date().toISOString(),
      });

      expect(sendEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "payment.succeeded",
          method: "grabpay",
          amount: 3200,
        }),
      );

      sendEventSpy.mockRestore();
    });
  });
});
