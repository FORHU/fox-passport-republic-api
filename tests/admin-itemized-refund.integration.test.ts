import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "../src/utils/prisma";

const refundsCreateMock = vi
  .fn()
  .mockImplementation(async () => ({ id: `re_test_${Math.random().toString(36).slice(2)}`, status: "succeeded" }));

vi.mock("stripe", () => {
  return {
    default: class {
      refunds = { create: refundsCreateMock };
      checkout = { sessions: { create: vi.fn() } };
      paymentIntents = { retrieve: vi.fn() };
      webhooks = { constructEvent: vi.fn() };
    },
  };
});

const AdminSvc = (await import("../src/modules/admin/admin.service")).default;
const InvoiceSvc = (await import("../src/modules/payment/invoice.service")).default;

describe("AdminSvc.createItemizedRefund — itemized, remaining-balance-validated, idempotent", () => {
  const runId = Math.random().toString(36).substring(7);
  let payerId: string;
  let providerId: string;
  let adminId: string;
  let eventId: string;

  const userIds: string[] = [];
  const eatIds: string[] = [];
  const invoiceIds: string[] = [];

  beforeAll(async () => {
    const payer = await prisma.user.create({
      data: { email: `refund_payer_${runId}@test.com`, password: "pw", name: "Payer" },
    });
    const provider = await prisma.user.create({
      data: { email: `refund_provider_${runId}@test.com`, password: "pw", name: "Provider" },
    });
    const admin = await prisma.user.create({
      data: { email: `refund_admin_${runId}@test.com`, password: "pw", name: "Admin", systemRole: "admin" },
    });
    payerId = payer.id;
    providerId = provider.id;
    adminId = admin.id;
    userIds.push(payerId, providerId, adminId);

    const event = await prisma.event.create({
      data: {
        clientId: payerId,
        organizerId: payerId,
        name: "Refund test event",
        description: "desc",
        eventCategory: "corporate",
        startAt: new Date(),
        endAt: new Date(),
        guestCount: 5,
        totalAmount: 1000,
      },
    });
    eventId = event.id;
  });

  afterAll(async () => {
    await prisma.refund.deleteMany({ where: { payment: { invoiceId: { in: invoiceIds } } } });
    await prisma.eventAssetTransaction.deleteMany({ where: { id: { in: eatIds } } });
    await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await prisma.event.delete({ where: { id: eventId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$executeRaw`DELETE FROM request_idempotency_keys WHERE endpoint = 'POST /admin/transactions/:id/refund'`;
  });

  async function makePaidItem(agreedPrice: number) {
    const transaction = await prisma.eventAssetTransaction.create({
      data: {
        eventId,
        providerId,
        assetId: (
          await prisma.asset.create({
            data: {
              ownerId: providerId,
              category: "equipment",
              name: `Refund test asset ${Math.random().toString(36).slice(2)}`,
              description: "desc",
              quantity: 5,
              price: agreedPrice,
              billingRate: "daily",
              status: "available",
            },
          })
        ).id,
        quantity: 1,
        agreedPrice,
        status: "approved",
      },
    });
    eatIds.push(transaction.id);

    const invoice = await InvoiceSvc.createInvoice({
      payerId,
      items: [
        {
          amount: agreedPrice,
          description: "Refund test item",
          sourceType: "event_asset_transaction" as any,
          sourceId: transaction.id,
        },
      ],
    });
    invoiceIds.push(invoice.id);

    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "paid" } });
    await prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        amount: agreedPrice,
        method: "card",
        status: "paid",
        providerReference: `pi_test_${Math.random().toString(36).slice(2)}`,
      },
    });

    return transaction;
  }

  it("issues a partial itemized refund and calls Stripe with the exact amount", async () => {
    const transaction = await makePaidItem(1000);
    refundsCreateMock.mockClear();

    const result: any = await AdminSvc.createItemizedRefund({
      kind: "asset",
      transactionId: transaction.id,
      amount: 300,
      reason: "Customer complaint",
      adminId,
      idempotencyKey: `refund-${Math.random()}`,
    });

    expect(result.status).toBe("succeeded");
    expect(refundsCreateMock).toHaveBeenCalledTimes(1);
    expect(refundsCreateMock.mock.calls[0][0].amount).toBe(30000); // cents
  });

  it("rejects a refund amount exceeding the remaining refundable balance", async () => {
    const transaction = await makePaidItem(500);

    await AdminSvc.createItemizedRefund({
      kind: "asset",
      transactionId: transaction.id,
      amount: 400,
      reason: "First partial",
      adminId,
      idempotencyKey: `refund-a-${Math.random()}`,
    });

    // Only 100 left refundable — requesting 200 must fail.
    await expect(
      AdminSvc.createItemizedRefund({
        kind: "asset",
        transactionId: transaction.id,
        amount: 200,
        reason: "Second, too much",
        adminId,
        idempotencyKey: `refund-b-${Math.random()}`,
      }),
    ).rejects.toThrow(/exceeds the remaining refundable balance/);
  });

  it("concurrent admin refunds on the same item are serialized: the second only succeeds for what remains", async () => {
    const transaction = await makePaidItem(1000);

    const results = await Promise.allSettled([
      AdminSvc.createItemizedRefund({
        kind: "asset",
        transactionId: transaction.id,
        amount: 700,
        reason: "Admin A",
        adminId,
        idempotencyKey: `concurrent-a-${Math.random()}`,
      }),
      AdminSvc.createItemizedRefund({
        kind: "asset",
        transactionId: transaction.id,
        amount: 700,
        reason: "Admin B",
        adminId,
        idempotencyKey: `concurrent-b-${Math.random()}`,
      }),
    ]);

    // Both requesting 700 out of 1000 available cannot both succeed —
    // exactly one must be rejected for exceeding the remaining balance.
    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);

    const totalRefunded = await prisma.refund.aggregate({
      _sum: { amount: true },
      where: { assetTransactionId: transaction.id, status: "succeeded" },
    });
    expect(totalRefunded._sum.amount?.toNumber()).toBeLessThanOrEqual(1000);
  });

  it("idempotency: a duplicate submission with the same key does not create a second refund", async () => {
    const transaction = await makePaidItem(1000);
    const key = `dup-${Math.random()}`;

    const first: any = await AdminSvc.createItemizedRefund({
      kind: "asset",
      transactionId: transaction.id,
      amount: 100,
      reason: "Test",
      adminId,
      idempotencyKey: key,
    });
    const second: any = await AdminSvc.createItemizedRefund({
      kind: "asset",
      transactionId: transaction.id,
      amount: 100,
      reason: "Test",
      adminId,
      idempotencyKey: key,
    });

    expect(second.id).toBe(first.id);
    const count = await prisma.refund.count({ where: { assetTransactionId: transaction.id } });
    expect(count).toBe(1);
  });

  it("rejects a zero or negative refund amount", async () => {
    const transaction = await makePaidItem(500);
    await expect(
      AdminSvc.createItemizedRefund({
        kind: "asset",
        transactionId: transaction.id,
        amount: 0,
        reason: "Invalid",
        adminId,
        idempotencyKey: `zero-${Math.random()}`,
      }),
    ).rejects.toThrow(/greater than zero/);
  });
});
