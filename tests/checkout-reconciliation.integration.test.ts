import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "../src/utils/prisma";

const sessionsCreateMock = vi
  .fn()
  .mockImplementation(async () => ({
    id: `cs_reconciled_${Math.random().toString(36).slice(2)}`,
    url: "http://checkout.url",
  }));

vi.mock("stripe", () => {
  return {
    default: class {
      checkout = { sessions: { create: sessionsCreateMock } };
      paymentIntents = { retrieve: vi.fn() };
      refunds = { create: vi.fn() };
      webhooks = { constructEvent: vi.fn() };
    },
  };
});

const CheckoutSvc = (await import("../src/modules/payment/checkout.service")).default;
const InvoiceSvc = (await import("../src/modules/payment/invoice.service")).default;

describe("CheckoutSvc.reconcileStaleCheckouts — lost-response recovery", () => {
  const runId = Math.random().toString(36).substring(7);
  let payerId: string;
  const checkoutIds: string[] = [];
  const invoiceIds: string[] = [];

  beforeAll(async () => {
    const payer = await prisma.user.create({
      data: { email: `reconcile_${runId}@test.com`, password: "pw", name: "Reconcile Payer" },
    });
    payerId = payer.id;
  });

  afterAll(async () => {
    await prisma.checkout.deleteMany({ where: { id: { in: checkoutIds } } });
    await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await prisma.user.delete({ where: { id: payerId } });
  });

  async function makeInvoiceAndCheckout(opts: {
    status: "active" | "completed";
    hasSession: boolean;
    ageMs: number;
  }) {
    const invoice = await InvoiceSvc.createInvoice({
      payerId,
      items: [
        {
          amount: 100,
          description: "Reconciliation test item",
          sourceType: "event_asset_transaction" as any,
          sourceId: `reconcile-src-${Math.random().toString(36).slice(2)}`,
        },
      ],
    });
    invoiceIds.push(invoice.id);

    const checkout = await prisma.checkout.create({
      data: {
        invoiceId: invoice.id,
        provider: "stripe",
        providerSessionId: opts.hasSession ? `cs_existing_${Math.random().toString(36).slice(2)}` : null,
        status: opts.status,
      },
    });
    // Backdate createdAt directly — bypassing Prisma's @default(now()) — so
    // "stale" vs "fresh" can be asserted deterministically without a real
    // wait.
    await prisma.$executeRaw`
      UPDATE checkouts SET "createdAt" = ${new Date(Date.now() - opts.ageMs)}
      WHERE id = ${checkout.id}
    `;
    checkoutIds.push(checkout.id);
    return { checkout, invoice };
  }

  it("recovers a stale checkout stuck with no provider session (the lost-response case)", async () => {
    const { checkout } = await makeInvoiceAndCheckout({
      status: "active",
      hasSession: false,
      ageMs: 10 * 60 * 1000, // 10 minutes old — past the 5-minute default staleness window
    });

    sessionsCreateMock.mockClear();
    const results = await CheckoutSvc.reconcileStaleCheckouts();

    const thisResult = results.find((r) => r.checkoutId === checkout.id);
    expect(thisResult?.outcome).toBe("recovered");
    expect(sessionsCreateMock).toHaveBeenCalledTimes(1);

    const updated = await prisma.checkout.findUnique({ where: { id: checkout.id } });
    expect(updated?.providerSessionId).not.toBeNull();
  });

  it("does NOT touch a checkout that is still within the staleness window", async () => {
    const { checkout } = await makeInvoiceAndCheckout({
      status: "active",
      hasSession: false,
      ageMs: 30 * 1000, // 30 seconds old — well within the window
    });

    sessionsCreateMock.mockClear();
    await CheckoutSvc.reconcileStaleCheckouts();

    expect(
      sessionsCreateMock.mock.calls.length,
    ).toBe(0);
    const unchanged = await prisma.checkout.findUnique({ where: { id: checkout.id } });
    expect(unchanged?.providerSessionId).toBeNull();
    expect(unchanged?.status).toBe("active");
  });

  it("never touches an already-completed checkout, even if old (monotonic status guard)", async () => {
    const { checkout } = await makeInvoiceAndCheckout({
      status: "completed",
      hasSession: true,
      ageMs: 60 * 60 * 1000, // 1 hour old
    });

    sessionsCreateMock.mockClear();
    await CheckoutSvc.reconcileStaleCheckouts();

    expect(sessionsCreateMock).not.toHaveBeenCalled();
    const unchanged = await prisma.checkout.findUnique({ where: { id: checkout.id } });
    expect(unchanged?.status).toBe("completed");
  });
});
