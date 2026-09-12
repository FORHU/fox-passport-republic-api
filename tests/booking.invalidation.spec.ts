import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The invalidation moved to the write.
 *
 * It used to sit in the services, one call per write path, and two writes had
 * already been missed: the reminder cron and the expiry sweep both reached the
 * database without passing a service that bumped. A missed bump is a citizen
 * seeing their own payment as unpaid, so "remember to call it" is not a good
 * enough rule - `docs/REDIS-PLAN.md` §0 records the decision being re-opened.
 *
 * What is pinned here is the property that replaced it: **every write method on
 * these two repositories retires the cached booking reads.** The list below is
 * the write surface. A new write that does not appear here should fail this
 * file, not production.
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

/**
 * Every `prisma.<model>.<method>()` resolves to an empty row. The repositories
 * are the subject here; what the database would have returned is not.
 */
const db = vi.hoisted(() => {
  const model = () =>
    new Proxy({} as Record<string, unknown>, {
      get: (_t, method) =>
        vi.fn(async () =>
          // `findMany` feeds the expiry sweep, which does nothing at all when
          // it finds nothing - so it has to find something here. Shaped for
          // `PaymentRepo.cancelExpiredPayments`, the one caller that nests
          // this deep (booking id via the payment's invoice item).
          method === "findMany"
            ? [
                {
                  id: "p1",
                  invoice: { items: [{ sourceId: "b1" }] },
                },
              ]
            : { id: "b1", count: 1 },
        ),
    });
  return new Proxy({} as Record<string, unknown>, {
    get: (_target, prop) => {
      if (prop === "$transaction") return vi.fn(async () => [{ id: "b1" }]);
      return model();
    },
  });
});

vi.mock("../src/utils/prisma", () => ({ prisma: db }));

import BookingRepo from "../src/modules/booking/booking.repository";
import PaymentRepo from "../src/modules/payment/payment.repository";

const VERSION_KEY = "cache:version:booking";

function version() {
  return Number(redis.store.get(VERSION_KEY) ?? "0");
}

beforeEach(() => {
  redis.store.clear();
  vi.clearAllMocks();
});

/** Name, and how to call it. Every write on the two repositories. */
const bookingWrites: [string, () => Promise<unknown>][] = [
  ["create", () => BookingRepo.create({} as never)],
  ["createWithIds", () => BookingRepo.createWithIds({} as never)],
  ["setHasReview", () => BookingRepo.setHasReview("b1", true)],
  ["setStripePaymentId", () => BookingRepo.setStripePaymentId("b1", "pi_1")],
  ["markConfirmed", () => BookingRepo.markConfirmed("b1")],
  ["cancel", () => BookingRepo.cancel("b1")],
  ["markPaymentCancelled", () => BookingRepo.markPaymentCancelled("p1")],
  ["markPaymentRefunded", () => BookingRepo.markPaymentRefunded("p1")],
  [
    "setPaymentTransaction",
    () =>
      BookingRepo.setPaymentTransaction("p1", {
        transactionId: "pi_1",
        method: "stripe",
      }),
  ],
  ["createRefund", () => BookingRepo.createRefund({} as never)],
  ["markAttendeeCheckedIn", () => BookingRepo.markAttendeeCheckedIn("a1")],
  ["update", () => BookingRepo.update("b1", {})],
  ["addAttendee", () => BookingRepo.addAttendee("b1", {} as never)],
  ["removeAttendee", () => BookingRepo.removeAttendee("a1")],
  ["updateAttendee", () => BookingRepo.updateAttendee("a1", {})],
  ["finalizeAttendees", () => BookingRepo.finalizeAttendees("b1")],
  ["updateStatus", () => BookingRepo.updateStatus("b1", "cancelled" as never)],
  ["confirmArrival", () => BookingRepo.confirmArrival("b1")],
  ["dispute", () => BookingRepo.dispute("b1")],
  [
    "claimReminders",
    () =>
      BookingRepo.claimReminders("b1", {
        reminder: true,
        paymentReminder: true,
      }),
  ],
];

const paymentWrites: [string, () => Promise<unknown>][] = [
  ["createPayment", () => PaymentRepo.createPayment({} as never)],
  [
    "updatePayment",
    () =>
      PaymentRepo.updatePayment("p1", { paymentStatus: "paid" as never }),
  ],
  ["setTransactionId", () => PaymentRepo.setTransactionId("p1", "pi_1")],
  ["markRefunded", () => PaymentRepo.markRefunded("p1")],
  ["cancelExpiredPayments", () => PaymentRepo.cancelExpiredPayments()],
];

describe("every BookingRepo write", () => {
  it.each(bookingWrites)("%s retires the cached reads", async (_name, call) => {
    const before = version();

    await call();

    expect(version()).toBeGreaterThan(before);
  });
});

describe("every PaymentRepo write", () => {
  // Payments are inside `BookingRepo.findById`'s include, so a payment row
  // changing changes what the booking page says.
  it.each(paymentWrites)("%s retires the cached reads", async (_name, call) => {
    const before = version();

    await call();

    expect(version()).toBeGreaterThan(before);
  });
});

describe("the bump itself", () => {
  it("makes the keys formed afterwards different ones", async () => {
    // Which is the whole mechanism: nothing is deleted, the keys move.
    const { versionedCache } = await import("../src/utils/cache.util");
    const cache = versionedCache("booking");
    const produce = vi.fn(async () => "rows");

    await cache.cached("user:u1:1:10", 30, produce);
    await BookingRepo.cancel("b1");
    await cache.cached("user:u1:1:10", 30, produce);

    expect(produce).toHaveBeenCalledTimes(2);
  });

  it("does not fail the write when Redis cannot be reached", async () => {
    redis.client.incr.mockRejectedValueOnce(new Error("connection reset"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    // The row is already written by this point. A cache that cannot be retired
    // is a stale read; a throw here would be a failed booking.
    await expect(BookingRepo.cancel("b1")).resolves.toBeDefined();
  });
});
