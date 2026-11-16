import type Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";

const idOf = (v: string | { id: string } | null | undefined) =>
  typeof v === "string" ? v : (v?.id ?? null);

/**
 * Chargebacks: a client asked their bank to take a payment back
 * (`charge.dispute.*`). Stripe pulls the disputed amount (plus its fee) from
 * the platform balance straight away, whoever was already paid out.
 *
 * This records each dispute so admins can see it and respond before the
 * evidence deadline. Nothing is reversed automatically: whether to claw a
 * payout back is an admin's decision, made with the existing refund and
 * reversal tools (api#363).
 */
export default class PaymentDisputeSvc {
  /** Create or update the record for one Stripe dispute. Idempotent by its id. */
  static async recordFromStripe(dispute: Stripe.Dispute) {
    const paymentIntentId = idOf(dispute.payment_intent);
    const payment = paymentIntentId
      ? await prisma.payment.findUnique({
          where: { providerReference: paymentIntentId },
          select: { id: true },
        })
      : null;

    const dueBy = dispute.evidence_details?.due_by;
    const data = {
      stripeChargeId: idOf(dispute.charge) ?? "",
      paymentIntentId,
      paymentId: payment?.id ?? null,
      // Stripe amounts are in the smallest unit; PHP has two decimals.
      amount: new Prisma.Decimal(dispute.amount).div(100),
      currency: dispute.currency,
      reason: dispute.reason,
      status: dispute.status,
      evidenceDueBy: dueBy ? new Date(dueBy * 1000) : null,
    };

    const record = await prisma.paymentDispute.upsert({
      where: { stripeDisputeId: dispute.id },
      create: { stripeDisputeId: dispute.id, ...data },
      update: data,
    });

    console.warn(
      `⚠️ Chargeback ${dispute.id} (${dispute.status}) on charge ${data.stripeChargeId}: ` +
        `${data.amount.toFixed(2)} ${dispute.currency.toUpperCase()}, reason ${dispute.reason}`,
    );
    return record;
  }

  /** Admin list, newest first, optionally by Stripe dispute status. */
  static async list(params: { status?: string; page: number; limit: number }) {
    const where: Prisma.PaymentDisputeWhereInput = params.status
      ? { status: params.status }
      : {};
    const [disputes, total] = await Promise.all([
      prisma.paymentDispute.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        include: {
          payment: {
            select: {
              id: true,
              invoiceId: true,
              assetBookingId: true,
              serviceBookingId: true,
              amount: true,
              status: true,
            },
          },
        },
      }),
      prisma.paymentDispute.count({ where }),
    ]);
    return {
      disputes,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
      },
    };
  }
}
