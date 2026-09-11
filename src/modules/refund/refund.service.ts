import Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import PaymentRepo from "../payment/payment.repository";
import { STRIPE_SECRET_KEY } from "../../config";
import { toStripeCents, formatCurrency } from "../../utils/pricing";
import { sendRefundUpdateEmail } from "../../utils/emails/refund";
import NotificationService from "../notifications/user-notification.service";

const stripe = new Stripe(STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-08-27.basil",
});

interface CancellationRule {
  hoursBeforeEvent: number;
  refundPercent: number;
}

interface CancellationPolicy {
  rules: CancellationRule[];
}

export default class RefundSvc {
  /**
   * Core policy-resolution logic.
   * Given the event start time and a cancellation policy, finds the best
   * matching rule and returns the refund percent that applies right now.
   *
   * Algorithm:
   *  1. hoursUntilEvent = (startAt - now) / 1h
   *  2. Sort rules by hoursBefore DESC
   *  3. Take the first rule where hoursUntilEvent >= rule.hoursBefore
   *  4. If none match -> 0% refund
   */
  static computeRefund(
    startAt: Date,
    policy: CancellationPolicy | null | undefined,
    now: Date = new Date(),
  ): {
    refundPercent: number;
    hoursUntilEvent: number;
    matchedRule: CancellationRule | null;
  } {
    const hoursUntilEvent =
      (startAt.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (!policy || !policy.rules || policy.rules.length === 0) {
      return { refundPercent: 0, hoursUntilEvent, matchedRule: null };
    }

    const sortedRules = [...policy.rules].sort(
      (a, b) => b.hoursBeforeEvent - a.hoursBeforeEvent,
    );

    const matchedRule =
      sortedRules.find((rule) => hoursUntilEvent >= rule.hoursBeforeEvent) ??
      null;

    return {
      refundPercent: matchedRule ? matchedRule.refundPercent : 0,
      hoursUntilEvent,
      matchedRule,
    };
  }

  static async checkEligibility(bookingId: string, userId: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        payments: true,
        event: {
          include: {
            template: {
              include: {
                cancellationPolicy: {
                  include: { rules: { orderBy: { hoursBeforeEvent: "desc" } } },
                },
              },
            },
            venueTransactions: {
              include: {
                venue: {
                  include: {
                    cancellationPolicy: {
                      include: {
                        rules: { orderBy: { hoursBeforeEvent: "desc" } },
                      },
                    },
                  },
                },
              },
            },
            serviceTransactions: {
              include: {
                service: {
                  include: {
                    cancellationPolicy: {
                      include: {
                        rules: { orderBy: { hoursBeforeEvent: "desc" } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!booking) throw new Error("Booking not found");
    if (booking.userId !== userId) throw new Error("Unauthorized");
    if (booking.status === "cancelled")
      throw new Error("Booking is already cancelled");

    const now = new Date();

    const policy = (booking.event.template?.cancellationPolicy ??
      booking.event.venueTransactions?.[0]?.venue?.cancellationPolicy ??
      booking.event.serviceTransactions?.[0]?.service?.cancellationPolicy) as
      CancellationPolicy | undefined;

    const { refundPercent, hoursUntilEvent, matchedRule } =
      RefundSvc.computeRefund(booking.startAt, policy, now);

    let eligible = true;
    let message = "";

    if (hoursUntilEvent <= 0) {
      eligible = false;
      message = "Event has already started — cancellation is no longer allowed";
    } else if (!matchedRule) {
      eligible = refundPercent > 0;
      message = "No refund available under the applicable cancellation policy";
    } else {
      message =
        refundPercent > 0
          ? `${refundPercent}% refund — ${Math.round(hoursUntilEvent * 10) / 10}h before start`
          : "No refund available under the applicable cancellation policy";
    }

    const totalPaid = booking.payments
      .filter(
        (p) => p.status === "completed" || (p.status as string) === "succeeded",
      )
      .reduce((sum, p) => sum.add(p.amount), new Prisma.Decimal(0));

    const estimatedRefund = totalPaid.mul(refundPercent).div(100);

    return {
      eligible,
      message,
      refundPercent,
      totalPaid,
      estimatedRefund,
      startAt: booking.startAt,
      hoursUntilStart: Math.round(hoursUntilEvent * 10) / 10,
    };
  }

  static async getFailedRefunds() {
    return prisma.refund.findMany({
      where: {
        status: "failed",
        resolved: false,
      },
      include: {
        booking: {
          include: {
            user: { select: { id: true, name: true, email: true } },
            event: { select: { id: true, name: true, startAt: true } },
          },
        },
        payment: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async getFailureReason(refundId: string) {
    const refund = await prisma.refund.findUnique({
      where: { id: refundId },
      include: {
        booking: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        payment: true,
      },
    });
    if (!refund) throw new Error("Refund not found");

    let stripeFailureDetail: Record<string, unknown> | null = null;

    if (refund.stripeRefundId) {
      try {
        const sr = await stripe.refunds.retrieve(refund.stripeRefundId);
        stripeFailureDetail = {
          id: sr.id,
          status: sr.status,
          failure_reason: sr.failure_reason,
          failure_balance_transaction: sr.failure_balance_transaction,
        };
        if (sr.status === "succeeded") {
          await prisma.refund.update({
            where: { id: refundId },
            data: { status: "succeeded" },
          });
        }
      } catch {
        // Stripe lookup failed — proceed with local data
      }
    }

    return {
      refund,
      stripeDetail: stripeFailureDetail,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async retryRefund(refundId: string, adminId: string) {
    const refund = await prisma.refund.findUnique({
      where: { id: refundId },
      include: { payment: true },
    });
    if (!refund) throw new Error("Refund not found");
    if (refund.status !== "failed")
      throw new Error("Only failed refunds can be retried");

    if (!refund.payment?.transactionId?.startsWith("pi_")) {
      throw new Error("No Stripe PaymentIntent to refund");
    }

    try {
      const sr = await stripe.refunds.create({
        payment_intent: refund.payment.transactionId,
        amount: toStripeCents(refund.amount.toNumber()),
      });

      const newRefundStatus =
        sr.status === "succeeded" ? "succeeded" : "pending";
      const newFailureReason =
        sr.status === "failed" ? (sr.failure_reason ?? "Unknown") : null;

      const updated = await prisma.refund.update({
        where: { id: refundId },
        data: {
          status: newRefundStatus,
          stripeRefundId: sr.id,
          failureReason: newFailureReason,
          failureCode: null,
          resolved: false,
          resolvedBy: null,
          resolvedAt: null,
          adminNotes: null,
        },
      });

      if (newRefundStatus === "succeeded" && refund.payment) {
        // Through the repository, which retires the cached booking: payments
        // are part of it, and the citizen is watching this one.
        await PaymentRepo.markRefunded(refund.payment.id);
      }

      return updated;
    } catch (e: unknown) {
      const err = e as Error & { code?: string };
      await prisma.refund.update({
        where: { id: refundId },
        data: {
          failureReason: err.message ?? "Stripe refund failed on retry",
          failureCode: err.code ?? null,
        },
      });
      throw new Error(`Retry failed: ${err.message}`);
    }
  }

  static async resolveManual(refundId: string, adminId: string, notes: string) {
    const refund = await prisma.refund.findUnique({
      where: { id: refundId },
      include: { payment: true },
    });
    if (!refund) throw new Error("Refund not found");

    const updated = await prisma.refund.update({
      where: { id: refundId },
      data: {
        status: "succeeded",
        resolved: true,
        resolvedBy: adminId,
        resolvedAt: new Date(),
        adminNotes: notes,
      },
    });

    if (refund.payment) {
      await PaymentRepo.markRefunded(refund.payment.id);
    }

    return updated;
  }

  static async handleWebhookRefundFailed(event: Stripe.Event) {
    const refund = event.data.object as Stripe.Refund;
    if (!refund.id) return;

    await prisma.refund.updateMany({
      where: { stripeRefundId: refund.id },
      data: {
        status: "failed",
        failureReason: refund.failure_reason ?? "Webhook reported failure",
        failureCode: null,
      },
    });

    const existing = await prisma.refund.findFirst({
      where: { stripeRefundId: refund.id },
      include: {
        booking: {
          include: {
            user: { select: { id: true, email: true } },
            event: { select: { name: true } },
          },
        },
        payment: true,
      },
    });

    if (existing?.booking?.user?.email) {
      sendRefundUpdateEmail({
        to: existing.booking.user.email,
        eventName: existing.booking.event?.name ?? "Unknown Event",
        bookingId: existing.bookingId,
        refundAmount: formatCurrency(existing.amount),
        status: "failed",
        failureReason: refund.failure_reason ?? undefined,
      });
    }

    if (existing?.booking?.user?.id) {
      NotificationService.create({
        userId: existing.booking.user.id,
        type: "PAYOUT",
        title: "Refund failed",
        message: `Your refund of ${formatCurrency(existing.amount)} for ${
          existing.booking.event?.name ?? "your booking"
        } failed.`,
        metadata: { link: `/bookings/${existing.bookingId}` },
      }).catch((e) => console.error("Failed to create refund notification", e));
    }
  }

  static async handleWebhookRefundSucceeded(event: Stripe.Event) {
    const refund = event.data.object as Stripe.Refund;
    if (!refund.id) return;

    const existing = await prisma.refund.findFirst({
      where: { stripeRefundId: refund.id },
      include: {
        booking: {
          include: {
            user: { select: { id: true, email: true } },
            event: { select: { name: true } },
          },
        },
        payment: true,
      },
    });
    if (!existing) return;

    await prisma.refund.update({
      where: { id: existing.id },
      data: { status: "succeeded" },
    });

    if (existing.payment) {
      await PaymentRepo.markRefunded(existing.payment.id);
    }

    if (existing.booking?.user?.email) {
      sendRefundUpdateEmail({
        to: existing.booking.user.email,
        eventName: existing.booking.event?.name ?? "Unknown Event",
        bookingId: existing.bookingId,
        refundAmount: formatCurrency(existing.amount),
        status: "succeeded",
      });
    }

    if (existing.booking?.user?.id) {
      NotificationService.create({
        userId: existing.booking.user.id,
        type: "PAYOUT",
        title: "Refund succeeded",
        message: `Your refund of ${formatCurrency(existing.amount)} for ${
          existing.booking.event?.name ?? "your booking"
        } has been processed.`,
        metadata: { link: `/bookings/${existing.bookingId}` },
      }).catch((e) => console.error("Failed to create refund notification", e));
    }
  }
}
