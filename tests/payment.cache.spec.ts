import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * §2b. Payment status is the read this whole design was most careful about: a
 * citizen who has just paid and is shown "unpaid" pays twice.
 *
 * So these are not on a TTL that hopes for the best. They live in the *booking*
 * cache namespace, which both repositories already retire at every write - the
 * same payload, the same writes, one counter. What is pinned here is that they
 * are genuinely cached, that the expiry sweep still runs when they hit, that a
 * retire reaches them, and that they come back as JSON rather than as Decimals
 * somebody will later call `.mul()` on.
 */

const redis = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    client: {
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      set: vi.fn(async (k: string, v: string) => {
        store.set(k, v);
        return "OK";
      }),
      incr: vi.fn(async (k: string) => {
        const next = Number(store.get(k) ?? "0") + 1;
        store.set(k, String(next));
        return next;
      }),
      del: vi.fn(async () => 1),
    },
  };
});

vi.mock("../src/utils/redis.util", () => ({
  default: { getClient: () => redis.client },
}));

const paymentRepo = vi.hoisted(() => ({
  getAllPayments: vi.fn(async () => [{ id: "p1" }]),
  getPaymentById: vi.fn(async () => ({ id: "p1" })),
  getPaymentByTransactionId: vi.fn(async () => ({ id: "p1" })),
  getBookingPayments: vi.fn(),
  cancelExpiredPayments: vi.fn(async () => 0),
}));

vi.mock("../src/modules/payment/payment.repository", () => ({
  default: paymentRepo,
}));

const bookingRepo = vi.hoisted(() => ({ findById: vi.fn() }));

vi.mock("../src/modules/booking/booking.repository", () => ({
  default: bookingRepo,
}));

vi.mock("../src/modules/refund/refund.service", () => ({ default: class {} }));
vi.mock("../src/modules/stripe-connect/stripe-connect.service", () => ({
  default: class {},
}));
vi.mock("../src/infrastructure/socket/invalidate", () => ({
  announceToUser: vi.fn(),
  announceToAdmins: vi.fn(),
}));

import PaymentSvc from "../src/modules/payment/payment.service";
import { bookingCache } from "../src/utils/cache-namespaces";

const PAYMENT = {
  id: "p1",
  bookingId: "b1",
  status: "paid",
  amount: new Prisma.Decimal("1500.00"),
  createdAt: new Date("2026-09-09T10:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  redis.store.clear();
  paymentRepo.getBookingPayments.mockImplementation(
    async (bookingId: string) => [{ ...PAYMENT, bookingId }],
  );
  bookingRepo.findById.mockResolvedValue({
    id: "b1",
    event: { totalAmount: new Prisma.Decimal("2000") },
    payments: [PAYMENT],
  });
});

describe("a booking's payments", () => {
  it("queries once, then serves the second read from cache", async () => {
    await PaymentSvc.getBookingPayments("b1");
    await PaymentSvc.getBookingPayments("b1");

    expect(paymentRepo.getBookingPayments).toHaveBeenCalledTimes(1);
  });

  it("keeps one booking's payments out of another's", async () => {
    const mine = await PaymentSvc.getBookingPayments("b1");
    const theirs = await PaymentSvc.getBookingPayments("b2");

    expect(mine[0].bookingId).toBe("b1");
    expect(theirs[0].bookingId).toBe("b2");
  });

  it("comes back as JSON rather than as Prisma types", async () => {
    // `.mul()` on this is the mistake the return type now makes a compile
    // error; the cancellation path deliberately reads uncached for that reason.
    const [payment] = await PaymentSvc.getBookingPayments("b1");

    expect(payment.amount).toBe("1500");
    expect(payment.createdAt).toBe("2026-09-09T10:00:00.000Z");
  });
});

describe("the expiry sweep", () => {
  it("still runs when the read hits the cache", async () => {
    // It is a write, and it cancels other people's expired payments. Inside the
    // cached block it would stop happening for as long as an entry lived.
    await PaymentSvc.getPaymentById("p1");
    await PaymentSvc.getPaymentById("p1");

    expect(paymentRepo.getPaymentById).toHaveBeenCalledTimes(1);
    expect(paymentRepo.cancelExpiredPayments).toHaveBeenCalledTimes(2);
  });

  it("runs before the all-payments read too", async () => {
    await PaymentSvc.getAllPayments();
    await PaymentSvc.getAllPayments();

    expect(paymentRepo.getAllPayments).toHaveBeenCalledTimes(1);
    expect(paymentRepo.cancelExpiredPayments).toHaveBeenCalledTimes(2);
  });
});

describe("sharing the booking namespace", () => {
  it("retires payment reads when the booking namespace is retired", async () => {
    // The point of not giving payments a namespace of their own: every write
    // that changes a payment already bumps this counter, so there is no second
    // invalidation for anyone to forget.
    await PaymentSvc.getBookingPayments("b1");
    await PaymentSvc.getRemainingBalance("b1");

    await bookingCache.invalidateAll();

    await PaymentSvc.getBookingPayments("b1");
    await PaymentSvc.getRemainingBalance("b1");

    // `getRemainingBalance` now calls `getBookingPayments` itself too —
    // `Booking` carries no `payments` relation any more, so it can't read
    // them off `bookingRepo.findById` the way it used to. Each round is
    // one direct call plus one from inside `getRemainingBalance`.
    expect(paymentRepo.getBookingPayments).toHaveBeenCalledTimes(4);
    expect(bookingRepo.findById).toHaveBeenCalledTimes(2);
  });
});

describe("the remaining balance", () => {
  it("caches the computed answer, not its inputs", async () => {
    const first = await PaymentSvc.getRemainingBalance("b1");
    const second = await PaymentSvc.getRemainingBalance("b1");

    expect(first).toEqual({
      totalAmount: 2000,
      paidAmount: 1500,
      remainingBalance: 500,
      currency: "PHP",
    });
    expect(second).toEqual(first);
    expect(bookingRepo.findById).toHaveBeenCalledTimes(1);
  });
});
