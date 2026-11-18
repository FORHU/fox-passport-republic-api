import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { Prisma } from "@prisma/client";
import { signTestSession } from "./helpers/test-session";

/**
 * #264 T10 over HTTP: a Match is priced by the server, never from the
 * client's `totalAmount`, and a Stripe payment is created only when that
 * server total is above 0 (a Match with no Foxers yet costs nothing, Q6).
 * The services are stubbed: the route, validation and controller are real.
 */

const match = vi.hoisted(() => ({ createMatchRequest: vi.fn() }));
vi.mock("../src/modules/match/match.service", () => ({ default: match }));

const payments = vi.hoisted(() => ({
  createPaymentIntent: vi.fn(async () => ({ clientSecret: "pi_secret" })),
}));
vi.mock("../src/modules/payment/payment.service", () => ({
  default: payments,
}));

const { default: app } = await import("../src/app");

const bearer = `Bearer ${signTestSession({
  userId: "match-client",
  email: "client@test.local",
  systemRole: "user",
  roleType: [],
})}`;

const body = {
  foxerId: "foxer",
  date: "2027-10-01T10:00:00.000Z",
  guestCount: 20,
  totalAmount: 99999, // the client's own figure
};

const created = (total: number) => ({
  eventRequest: { totalAmount: new Prisma.Decimal(total) },
  booking: { id: "booking-1" },
});

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/matches (#264 T10)", () => {
  it("never passes the client's totalAmount on", async () => {
    match.createMatchRequest.mockResolvedValue(created(0));
    const res = await request(app)
      .post("/api/v1/matches")
      .set("Authorization", bearer)
      .send(body);

    expect(res.status).toBe(201);
    expect(match.createMatchRequest).toHaveBeenCalledWith(
      expect.not.objectContaining({ totalAmount: expect.anything() }),
    );
  });

  it("creates no Stripe payment when the server total is 0", async () => {
    match.createMatchRequest.mockResolvedValue(created(0));
    const res = await request(app)
      .post("/api/v1/matches")
      .set("Authorization", bearer)
      .send(body);

    expect(res.status).toBe(201);
    expect(payments.createPaymentIntent).not.toHaveBeenCalled();
  });

  it("charges the server total, not the client's", async () => {
    match.createMatchRequest.mockResolvedValue(created(17750));
    const res = await request(app)
      .post("/api/v1/matches")
      .set("Authorization", bearer)
      .send(body);

    expect(res.status).toBe(201);
    expect(payments.createPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 17750, bookingId: "booking-1" }),
    );
  });
});
