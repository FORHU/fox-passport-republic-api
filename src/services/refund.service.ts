import Stripe from "stripe";
import { prisma } from "../utils/prisma";
import { STRIPE_SECRET_KEY } from "../config";
import { sendBookingCancelledEmail } from "../utils/emails/cancellation";
import { sendRefundUpdateEmail } from "../utils/emails/refund";

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
    now: Date = new Date()
  ): { refundPercent: number; hoursUntilEvent: number; matchedRule: CancellationRule | null } {
    const hoursUntilEvent = (startAt.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (!policy || !policy.rules || policy.rules.length === 0) {
      return { refundPercent: 0, hoursUntilEvent, matchedRule: null };
    }

    const sortedRules = [...policy.rules].sort((a, b) => b.hoursBeforeEvent - a.hoursBeforeEvent);

    const matchedRule =
      sortedRules.find((rule) => hoursUntilEvent >= rule.hoursBeforeEvent) ?? null;

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
                      include: { rules: { orderBy: { hoursBeforeEvent: "desc" } } },
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
                      include: { rules: { orderBy: { hoursBeforeEvent: "desc" } } },
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
    if (booking.status === "cancelled") throw new Error("Booking is already cancelled");

    const now = new Date();

    const policy = (
      booking.event.template?.cancellationPolicy
      ?? (booking.event as any).venueTransactions?.[0]?.venue?.cancellationPolicy
      ?? (booking.event as any).serviceTransactions?.[0]?.service?.cancellationPolicy
    ) as CancellationPolicy | undefined;

    const { refundPercent, hoursUntilEvent, matchedRule } = RefundSvc.computeRefund(
      booking.startAt,
      policy,
      now
    );

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
      .filter((p) => p.status === "completed" || (p.status as string) === "succeeded")
      .reduce((sum, p) => sum + p.amount, 0);

    const estimatedRefund = Math.round(((totalPaid * refundPercent) / 100) * 100) / 100;

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

  static async cancelAndRefund(bookingId: string, userId: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        payments: true,
        user: { select: { id: true, name: true, email: true } },
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
                      include: { rules: { orderBy: { hoursBeforeEvent: "desc" } } },
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
                      include: { rules: { orderBy: { hoursBeforeEvent: "desc" } } },
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
    if (booking.status === "cancelled") throw new Error("Booking is already cancelled");

    const policy = (
      booking.event.template?.cancellationPolicy
      ?? (booking.event as any).venueTransactions?.[0]?.venue?.cancellationPolicy
      ?? (booking.event as any).serviceTransactions?.[0]?.service?.cancellationPolicy
    ) as CancellationPolicy | undefined;
    const { refundPercent, hoursUntilEvent } = RefundSvc.computeRefund(booking.startAt, policy);

    if (hoursUntilEvent <= 0) {
      throw new Error("Event has already started — cancellation is no longer allowed");
    }

    const completedPayments = booking.payments.filter((p) => p.status === "completed");
    const pendingPayments = booking.payments.filter((p) => p.status === "pending");

    // Void any pending (not-yet-captured) transactions instead of refunding them.
    for (const payment of pendingPayments) {
      if (payment.transactionId?.startsWith("pi_")) {
        try {
          await stripe.paymentIntents.cancel(payment.transactionId);
        } catch (err) {
          // If it can't be cancelled (e.g. already captured/succeeded on Stripe's
          // side), fall through — it'll be handled as a completed payment on the
          // next sync, or can be retried manually.
        }
      }

      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "voided" as any },
      });
    }

    if (completedPayments.length === 0) {
      const updated = await prisma.booking.update({
        where: { id: bookingId },
        data: { status: "cancelled" },
      });
      return { booking: updated, refunds: [] };
    }

    const refunds: any[] = [];

    for (const payment of completedPayments) {
      let stripeRefundId: string | null = null;
      let refundStatus: "pending" | "succeeded" | "failed" = "pending";
      let failureReason: string | null = null;

      const estimatedRefund =
        Math.round(((payment.amount * refundPercent) / 100) * 100) / 100;

      if (refundPercent <= 0) {
        // Nothing to refund for this payment under the policy — record it as
        // a resolved zero-amount refund so it's visible in history.
        const refund = await prisma.refund.create({
          data: {
            bookingId,
            paymentId: payment.id,
            amount: 0,
            currency: payment.currency,
            stripeRefundId: null,
            status: "succeeded" as any,
            failureReason: null,
            initiatedBy: userId,
          },
        });
        refunds.push(refund);
        continue;
      }

      if (payment.transactionId?.startsWith("pi_")) {
        try {
          const refund = await stripe.refunds.create({
            payment_intent: payment.transactionId,
            amount: Math.round(estimatedRefund * 100),
          });
          stripeRefundId = refund.id;
          refundStatus = refund.status === "succeeded" ? "succeeded" : "pending";
          if (refund.status === "failed") {
            failureReason = refund.failure_reason ?? "Unknown Stripe error";
            refundStatus = "failed";
          }
        } catch (err: any) {
          stripeRefundId = null;
          refundStatus = "failed";
          failureReason = err.message ?? "Stripe refund failed";
        }
      }

      const refund = await prisma.refund.create({
        data: {
          bookingId,
          paymentId: payment.id,
          amount: estimatedRefund,
          currency: payment.currency,
          stripeRefundId,
          status: refundStatus as any,
          failureReason,
          initiatedBy: userId,
        },
      });

      if (refundStatus === "succeeded") {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: "refunded" },
        });
      }

      refunds.push(refund);
    }

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: { status: "cancelled" },
    });

    const eventName = booking.event?.name ?? "Unknown Event";
    const userEmail = booking.user?.email;
    const totalPaid = completedPayments.reduce((s, p) => s + p.amount, 0);
    const totalRefunded = refunds.reduce((s: number, r: any) => s + (r.amount ?? 0), 0);

    if (userEmail) {
      sendBookingCancelledEmail({
        to: userEmail,
        eventName,
        bookingId,
        startDate: booking.startAt?.toISOString() ?? "N/A",
        totalPaid: `PHP ${totalPaid.toFixed(2)}`,
        refundAmount: `PHP ${totalRefunded.toFixed(2)}`,
        refundStatus: refunds.some((r: any) => r.status === "failed")
          ? "Some refunds failed — contact support"
          : "Processed successfully",
      });
    }

    return { booking: updated, refunds };
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

    let stripeFailureDetail: Record<string, any> | null = null;

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

  static async retryRefund(refundId: string, adminId: string) {
    const refund = await prisma.refund.findUnique({
      where: { id: refundId },
      include: { payment: true },
    });
    if (!refund) throw new Error("Refund not found");
    if (refund.status !== "failed") throw new Error("Only failed refunds can be retried");

    if (!refund.payment?.transactionId?.startsWith("pi_")) {
      throw new Error("No Stripe PaymentIntent to refund");
    }

    try {
      const sr = await stripe.refunds.create({
        payment_intent: refund.payment.transactionId,
        amount: Math.round(refund.amount * 100),
      });

      const newRefundStatus = sr.status === "succeeded" ? "succeeded" : "pending";
      const newFailureReason = sr.status === "failed" ? (sr.failure_reason ?? "Unknown") : null;

      const updated = await prisma.refund.update({
        where: { id: refundId },
        data: {
          status: newRefundStatus as any,
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
        await prisma.payment.update({
          where: { id: refund.payment.id },
          data: { status: "refunded" },
        });
      }

      return updated;
    } catch (err: any) {
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
      await prisma.payment.update({
        where: { id: refund.payment.id },
        data: { status: "refunded" },
      });
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
        booking: { include: { user: { select: { email: true } }, event: { select: { name: true } } } },
        payment: true,
      },
    });

    if (existing?.booking?.user?.email) {
      sendRefundUpdateEmail({
        to: existing.booking.user.email,
        eventName: existing.booking.event?.name ?? "Unknown Event",
        bookingId: existing.bookingId,
        refundAmount: `PHP ${existing.amount.toFixed(2)}`,
        status: "failed",
        failureReason: refund.failure_reason ?? undefined,
      });
    }
  }

  static async handleWebhookRefundSucceeded(event: Stripe.Event) {
    const refund = event.data.object as Stripe.Refund;
    if (!refund.id) return;

    const existing = await prisma.refund.findFirst({
      where: { stripeRefundId: refund.id },
      include: {
        booking: { include: { user: { select: { email: true } }, event: { select: { name: true } } } },
        payment: true,
      },
    });
    if (!existing) return;

    await prisma.refund.update({
      where: { id: existing.id },
      data: { status: "succeeded" },
    });

    if (existing.payment) {
      await prisma.payment.update({
        where: { id: existing.payment.id },
        data: { status: "refunded" },
      });
    }

    if (existing.booking?.user?.email) {
      sendRefundUpdateEmail({
        to: existing.booking.user.email,
        eventName: existing.booking.event?.name ?? "Unknown Event",
        bookingId: existing.bookingId,
        refundAmount: `PHP ${existing.amount.toFixed(2)}`,
        status: "succeeded",
      });
    }
  }
}