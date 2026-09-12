import { prisma } from "../../utils/prisma";
import PricingSvc, { PricingContext } from "../pricing/pricing.service";
import { Invoice, InvoiceItem, Prisma, InvoiceSourceType } from "@prisma/client";
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
                in: ["pending", "processing", "paid"]
              }
            }
          },
          include: { invoice: true }
        });

        if (existingItem) {
          throw new Error(
            `Cannot invoice ${item.sourceType} ${item.sourceId} because it is already associated with invoice ${existingItem.invoiceId} (Status: ${existingItem.invoice.status})`
          );
        }
      }

      // 2. Calculate Subtotal
      const subtotalNum = data.items.reduce((sum, item) => {
        const amt = item.amount instanceof Prisma.Decimal ? item.amount.toNumber() : item.amount;
        return sum + amt;
      }, 0);

      // 3. Resolve Pricing Rule, Validate Voucher & Calculate Complete Breakdown
      const pricingContext = {
        ...data.pricingContext,
        userId: data.pricingContext?.userId || data.payerId
      };
      const pricingBreakdown = await PricingSvc.calculatePrice(subtotalNum, pricingContext);

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
            create: data.items.map(item => ({
              amount: item.amount,
              description: item.description,
              sourceType: item.sourceType,
              sourceId: item.sourceId,
            }))
          }
        },
        include: {
          items: true
        }
      });

      return invoice;
    });
  }

  static async getInvoice(invoiceId: string) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { items: true, checkouts: true, payments: true }
    });
    if (!invoice) throw new Error("Invoice not found");
    return invoice;
  }

  static async cancelInvoice(invoiceId: string) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId }
    });
    if (!invoice) throw new Error("Invoice not found");
    if (invoice.status === "paid") {
      throw new Error("Cannot cancel a paid invoice");
    }

    return prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: "cancelled" }
    });
  }
}
