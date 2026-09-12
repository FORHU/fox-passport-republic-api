import Stripe from "stripe";
import { Prisma, PaymentStatus, RefundStatus } from "@prisma/client";
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

    const payments = await PaymentRepo.getBookingPayments(bookingId);
    const totalPaid = payments
      .filter((p) => p.status === PaymentStatus.paid)
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
    // No separate "resolved" flag any more — `retryRefund`/`resolveManual`
    // both move a refund's status away from `failed` on success, so a plain
    // status filter already is the unresolved list.
    return prisma.refund.findMany({
      where: {
        status: RefundStatus.failed,
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

    if (refund.providerReference) {
      try {
        const sr = await stripe.refunds.retrieve(refund.providerReference);
        stripeFailureDetail = {
          id: sr.id,
          status: sr.status,
          failure_reason: sr.failure_reason,
          failure_balance_transaction: sr.failure_balance_transaction,
        };
        if (sr.status === "succeeded") {
          await prisma.refund.update({
            where: { id: refundId },
            data: { status: RefundStatus.succeeded },
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

    if (!refund.payment?.providerReference?.startsWith("pi_")) {
      throw new Error("No Stripe PaymentIntent to refund");
    }

    try {
      const sr = await stripe.refunds.create({
        payment_intent: refund.payment.providerReference,
        amount: toStripeCents(refund.amount.toNumber()),
      });

      const newRefundStatus =
        sr.status === "succeeded"
          ? RefundStatus.succeeded
          : sr.status === "failed"
            ? RefundStatus.failed
            : RefundStatus.pending;

      const updated = await prisma.refund.update({
        where: { id: refundId },
        data: {
          status: newRefundStatus,
          providerReference: sr.id,
        },
      });

      if (newRefundStatus === RefundStatus.succeeded && refund.payment) {
        // Through the repository, which retires the cached booking: payments
        // are part of it, and the citizen is watching this one.
        await PaymentRepo.markRefunded(refund.payment.id);
      }

      return updated;
    } catch (e: unknown) {
      // No `failureReason`/`failureCode` columns any more — the refund stays
      // `failed` and this is the only surviving record of why.
      const err = e as Error & { code?: string };
      console.error(
        `Refund retry failed for ${refundId}: ${err.message}`,
        err.code,
      );
      throw new Error(`Retry failed: ${err.message}`);
    }
  }

  static async resolveManual(refundId: string, adminId: string, notes: string) {
    const refund = await prisma.refund.findUnique({
      where: { id: refundId },
      include: { payment: true },
    });
    if (!refund) throw new Error("Refund not found");

    // No `resolved`/`resolvedBy`/`resolvedAt`/`adminNotes` columns any more —
    // moving status to `succeeded` is itself the resolution (see
    // `getFailedRefunds`); the admin id and note are audit-logged only.
    console.log(
      `Refund ${refundId} manually resolved by admin ${adminId}: ${notes}`,
    );

    const updated = await prisma.refund.update({
      where: { id: refundId },
      data: {
        status: RefundStatus.succeeded,
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

    // No `failureReason`/`failureCode` columns any more — the webhook
    // payload's own `failure_reason` is logged, not persisted.
    console.error(
      `Refund webhook reported failure for ${refund.id}: ${refund.failure_reason ?? "unknown"}`,
    );
    await prisma.refund.updateMany({
      where: { providerReference: refund.id },
      data: {
        status: RefundStatus.failed,
      },
    });

    const existing = await prisma.refund.findFirst({
      where: { providerReference: refund.id },
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

    if (existing?.booking?.user?.email && existing.bookingId) {
      sendRefundUpdateEmail({
        to: existing.booking.user.email,
        eventName: existing.booking.event?.name ?? "Unknown Event",
        bookingId: existing.bookingId,
        refundAmount: formatCurrency(existing.amount),
        status: "failed",
        failureReason: refund.failure_reason ?? undefined,
      });
    }

    if (existing?.booking?.user?.id && existing.bookingId) {
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
      where: { providerReference: refund.id },
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
      data: { status: RefundStatus.succeeded },
    });

    if (existing.payment) {
      await PaymentRepo.markRefunded(existing.payment.id);
    }

    if (existing.booking?.user?.email && existing.bookingId) {
      sendRefundUpdateEmail({
        to: existing.booking.user.email,
        eventName: existing.booking.event?.name ?? "Unknown Event",
        bookingId: existing.bookingId,
        refundAmount: formatCurrency(existing.amount),
        status: "succeeded",
      });
    }

    if (existing.booking?.user?.id && existing.bookingId) {
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
