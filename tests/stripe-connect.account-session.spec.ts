import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

/**
 * The embedded Stripe dashboard used to get its session from an
 * unauthenticated web route that took the account id from the request body
 * (localStorage): any visitor could open any connected account's balances and
 * payouts, and after an account switch the next user opened the previous one's.
 * The session now comes from the API, for the caller's own account only.
 */

const stripe = vi.hoisted(() => ({
  accountSessions: { create: vi.fn(async () => ({ client_secret: "cs_1" })) },
  accounts: { create: vi.fn(async () => ({ id: "acct_new" })) },
}));
vi.mock("stripe", () => ({
  default: vi.fn(function () {
    return stripe;
  }),
}));

const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));
vi.mock("../src/utils/prisma", () => ({ prisma: db }));

const auth = vi.hoisted(() => ({ user: null as unknown }));
vi.mock("../src/middleware/auth.middleware", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("../src/middleware/auth.middleware")>();
  return {
    ...real,
    authenticate: (req: any, res: any, next: any) =>
      auth.user
        ? ((req.user = auth.user), next())
        : res.status(401).json({ success: false }),
  };
});

import express from "express";
import router from "../src/modules/stripe-connect/stripe-connect.routes";

const app = express().use(express.json()).use("/stripe-connect", router);
const VENUE_FOXER = {
  userId: "u1",
  email: "m@example.com",
  systemRole: "user",
  roleType: ["venueFoxer"],
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = VENUE_FOXER;
  db.user.findUnique.mockResolvedValue({
    id: "u1",
    stripeAccountId: "acct_mine",
    paymentAccount: null,
  });
});

describe("POST /stripe-connect/account-session", () => {
  it("opens the caller's own account, whatever the body names", async () => {
    const res = await request(app)
      .post("/stripe-connect/account-session")
      .send({ stripeAccountId: "acct_someone_else" });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ clientSecret: "cs_1" });
    expect(stripe.accountSessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ account: "acct_mine" }),
    );
  });

  it("refuses a visitor who isn't signed in", async () => {
    auth.user = null;
    const res = await request(app).post("/stripe-connect/account-session");
    expect(res.status).toBe(401);
    expect(stripe.accountSessions.create).not.toHaveBeenCalled();
  });

  it("refuses a role that receives no payouts", async () => {
    auth.user = { ...VENUE_FOXER, roleType: [] };
    const res = await request(app).post("/stripe-connect/account-session");
    expect(res.status).toBe(403);
    expect(stripe.accountSessions.create).not.toHaveBeenCalled();
  });
});
