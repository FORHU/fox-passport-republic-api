import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

/**
 * api#396: a Stripe account that sets up Connect fresh refuses Accounts v1
 * (`stripe.accounts.create`), so new payout recipients are created through
 * Accounts v2 (`POST /v2/core/accounts`). Onboarding links, sessions and
 * transfers keep using v1 endpoints, which accept a v2 account's id.
 */

const stripe = vi.hoisted(() => ({
  rawRequest: vi.fn(),
  // No id: the platform's own account, whose country new accounts get.
  accounts: {
    create: vi.fn(),
    retrieve: vi.fn(async () => ({ country: "SG" })),
  },
  accountLinks: {
    create: vi.fn(async () => ({ url: "https://connect.stripe.com/setup/x" })),
  },
}));
vi.mock("stripe", () => ({
  default: vi.fn(function () {
    return stripe;
  }),
}));

const db = vi.hoisted(() => {
  const tx = {
    paymentAccount: { upsert: vi.fn() },
    user: { update: vi.fn() },
  };
  return {
    tx,
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
});
vi.mock("../src/utils/prisma", () => ({ prisma: db }));
vi.mock("../src/utils/cache-namespaces", () => ({
  userCache: { invalidateAll: vi.fn() },
}));

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

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = {
    userId: "u1",
    email: "foxer@example.com",
    systemRole: "user",
    roleType: ["venueFoxer"],
  };
  db.user.findUnique.mockResolvedValue({
    id: "u1",
    email: "foxer@example.com",
    name: "Foxer One",
    stripeAccountId: null,
    paymentAccount: null,
  });
  stripe.rawRequest.mockResolvedValue({ id: "acct_v2_new" });
});

describe("POST /stripe-connect/onboard (Accounts v2)", () => {
  it("creates a recipient account through /v2/core/accounts, once per user", async () => {
    const res = await request(app).post("/stripe-connect/onboard");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      url: "https://connect.stripe.com/setup/x",
    });
    expect(stripe.accounts.create).not.toHaveBeenCalled();
    expect(stripe.rawRequest).toHaveBeenCalledTimes(1);
    expect(stripe.rawRequest).toHaveBeenCalledWith(
      "POST",
      "/v2/core/accounts",
      {
        contact_email: "foxer@example.com",
        display_name: "Foxer One",
        dashboard: "express",
        // The platform's country, as v1 gave an account created without one.
        identity: { country: "sg" },
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: {
                stripe_transfers: { requested: true },
              },
            },
          },
        },
        defaults: {
          responsibilities: {
            fees_collector: "application",
            losses_collector: "application",
          },
        },
        metadata: { userId: "u1" },
      },
      {
        apiVersion: "2025-12-15.clover",
        idempotencyKey: "connect-account:u1",
      },
    );
    expect(db.tx.paymentAccount.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { userId: "u1", stripeAccountId: "acct_v2_new" },
      }),
    );
    expect(db.tx.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { stripeAccountId: "acct_v2_new" },
    });
    // The v1 onboarding link takes the v2 account's id.
    expect(stripe.accountLinks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        account: "acct_v2_new",
        type: "account_onboarding",
      }),
    );
  });

  it("reuses an existing account, v1 or v2, without creating another", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "foxer@example.com",
      stripeAccountId: null,
      paymentAccount: { stripeAccountId: "acct_v1_old" },
    });

    const res = await request(app).post("/stripe-connect/onboard");

    expect(res.status).toBe(200);
    expect(stripe.rawRequest).not.toHaveBeenCalled();
    expect(stripe.accountLinks.create).toHaveBeenCalledWith(
      expect.objectContaining({ account: "acct_v1_old" }),
    );
  });

  it("saves nothing when Stripe returns no account id", async () => {
    stripe.rawRequest.mockResolvedValue({ object: "v2.core.account" });

    const res = await request(app).post("/stripe-connect/onboard");

    expect(res.status).toBe(400);
    expect(db.tx.paymentAccount.upsert).not.toHaveBeenCalled();
    expect(stripe.accountLinks.create).not.toHaveBeenCalled();
  });
});
