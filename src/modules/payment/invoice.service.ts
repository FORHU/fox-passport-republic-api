import { prisma } from "../../utils/prisma";
import PricingSvc, { PricingContext } from "../pricing/pricing.service";
import { Prisma, InvoiceSourceType } from "@prisma/client";
type Decimal = Prisma.Decimal;

export interface CreateInvoiceParams {
  payerId: string;
  pricingContext: PricingContext;
  items: {
    amount: number | Decimal;
    description: string;
    sourceType: InvoiceSourceType;
    sourceId: string;
  }[];
  dueDate?: Date;
}

export default class InvoiceSvc {
  /**
   * Creates an invoice safely. Ensures no duplicate transactions are invoiced.
   */
  static async createInvoice(data: CreateInvoiceParams) {
    if (!data.items || data.items.length === 0) {
      throw new Error("Cannot create an invoice without items.");
    }

    return prisma.$transaction(async (tx) => {
      // 1. Prevent Double Invoicing
      // Check if any of the provided sourceIds are already in an active invoice.
      for (const item of data.items) {
        const existingItem = await tx.invoiceItem.findFirst({
          where: {
            sourceType: item.sourceType,
            sourceId: item.sourceId,
            invoice: {
              status: {
                in: ["pending", "processing", "paid"],
              },
            },
          },
          include: { invoice: true },
        });

        if (existingItem) {
          throw new Error(
            `Cannot invoice ${item.sourceType} ${item.sourceId} because it is already associated with invoice ${existingItem.invoiceId} (Status: ${existingItem.invoice.status})`,
          );
        }
      }

      // 2. Calculate Subtotal
      const subtotalNum = data.items.reduce((sum, item) => {
        const amt =
          item.amount instanceof Prisma.Decimal
            ? item.amount.toNumber()
            : item.amount;
        return sum + amt;
      }, 0);

      // 3. Resolve Pricing Rule, Validate Voucher & Calculate Complete Breakdown
      const pricingContext = {
        ...data.pricingContext,
        userId: data.pricingContext?.userId || data.payerId,
      };
      const pricingBreakdown = await PricingSvc.calculatePrice(
        subtotalNum,
        pricingContext,
      );

      // 4. Create Invoice & Items
      const invoice = await tx.invoice.create({
        data: {
          payerId: data.payerId,
          subtotalAmount: pricingBreakdown.subtotal,

          discountAmount: pricingBreakdown.discount?.amount || 0,
          // Prisma's `Json?` wants its own null sentinel, not a plain `null`,
          // to write SQL NULL rather than the JSON literal `null`.
          discountSnapshot: pricingBreakdown.discount ?? Prisma.JsonNull,

          discountedSubtotal: pricingBreakdown.discountedSubtotal,

          platformFeeAmount: pricingBreakdown.platformFee?.amount || 0,
          platformFeeSnapshot: pricingBreakdown.platformFee ?? Prisma.JsonNull,

          grossAmount: pricingBreakdown.finalAmount,

          dueDate: data.dueDate,
          items: {
            create: data.items.map((item) => ({
              amount: item.amount,
              description: item.description,
              sourceType: item.sourceType,
              sourceId: item.sourceId,
            })),
          },
        },
        include: {
          items: true,
        },
      });

      return invoice;
    });
  }

  static async getInvoice(invoiceId: string) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { items: true, checkouts: true, payments: true },
    });
    if (!invoice) throw new Error("Invoice not found");
    return invoice;
  }

  /**
   * The most recent invoice carrying an item for this source, regardless of
   * status — used both to make checkout creation retry-safe (reuse a
   * pending/processing invoice instead of hitting the double-invoicing
   * guard above) and to answer "what's the payment state of this thing"
   * (a partnership proposal, an event) without the caller re-deriving it.
   *
   * A source can only ever belong to one invoice at a time in practice —
   * `createInvoice`'s own guard refuses to double-invoice a still-active
   * one — but a source can accumulate history (an invoice that was
   * cancelled, then re-invoiced later), so this orders by the invoice's own
   * `createdAt`, not the item's — `InvoiceItem` has no timestamp of its own.
   */
  static async findInvoiceForSource(
    sourceType: InvoiceSourceType,
    sourceId: string,
  ) {
    const item = await prisma.invoiceItem.findFirst({
      where: { sourceType, sourceId },
      include: { invoice: true },
      orderBy: { invoice: { createdAt: "desc" } },
    });
    return item?.invoice ?? null;
  }

  /**
   * The shape `GET /v1/invoices/:id` returns. `status` is the invoice's own
   * lifecycle field; `paymentStatus` is the most recent payment attempt's
   * status where one exists — the two can genuinely differ, because
   * `WebhookSvc.handlePaymentFailure` deliberately marks the Payment
   * `failed` while leaving the Invoice `pending` so the payer can retry.
   * Resolved here, once, so no caller ever has to reduce a payments list
   * itself.
   */
  static async getInvoiceStatus(invoiceId: string) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!invoice) throw new Error("Invoice not found");

    return {
      invoiceId: invoice.id,
      payerId: invoice.payerId,
      status: invoice.status,
      paymentStatus: invoice.payments[0]?.status ?? invoice.status,
    };
  }

  static async cancelInvoice(invoiceId: string) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) throw new Error("Invoice not found");
    if (invoice.status === "paid") {
      throw new Error("Cannot cancel a paid invoice");
    }

    return prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: "cancelled" },
    });
  }
}
