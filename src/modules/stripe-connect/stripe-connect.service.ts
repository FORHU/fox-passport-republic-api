import Stripe from "stripe";
import { userCache } from "../../utils/cache-namespaces";
import { prisma } from "../../utils/prisma";
import {
  STRIPE_SECRET_KEY,
  STRIPE_CONNECT_REFRESH_URL,
  STRIPE_CONNECT_RETURN_URL,
} from "../../config";

const stripe = new Stripe(STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-08-27.basil",
});

// ------------SERVICE METHODS-----------------------------
export async function createStripeConnectAccount(user: {
  id: string;
  email: string;
}) {
  const account = await stripe.accounts.create({
    type: "express",
    email: user.email,
    capabilities: { transfers: { requested: true } },
  });

  await prisma.$transaction(async (tx) => {
    // [MIGRATION-FLAG: Stage 3 Switch] 1. Persist to modular PaymentAccount (lazy creation)
    await tx.paymentAccount.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        stripeAccountId: account.id,
      },
      update: {
        stripeAccountId: account.id,
      },
    });

    // [MIGRATION-FLAG: Stage 3 Switch] 2. Legacy dual-write during transition
    await tx.user.update({
      where: { id: user.id },
      data: { stripeAccountId: account.id },
    });
  });

  await userCache.invalidateAll();

  return account;
}

export async function createAccountLink(stripeAccountId: string) {
  return stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: STRIPE_CONNECT_REFRESH_URL,
    return_url: STRIPE_CONNECT_RETURN_URL,
    type: "account_onboarding",
  });
}

export async function getStripeAccountStatus(stripeAccountId: string) {
  const account = await stripe.accounts.retrieve(stripeAccountId);

  const status = account.payouts_enabled
    ? "active"
    : account.details_submitted
      ? "pending"
      : "incomplete";

  return {
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
    chargesEnabled: account.charges_enabled,
    status,
  };
}

/**
 * Stripe Connect Express onboarding for Mayor/Foxer/Host payout recipients.
 * See docs/adr/0002-stripe-connect-payouts.md.
 */
export default class StripeConnectSvc {
  static async createExpressAccount(userId: string): Promise<string> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { paymentAccount: true },
    });
    if (!user) throw new Error("User not found");

    const existingAccountId =
      user.paymentAccount?.stripeAccountId || user.stripeAccountId;
    if (existingAccountId) return existingAccountId;

    const account = await stripe.accounts.create({
      type: "express",
      email: user.email,
      capabilities: {
        transfers: { requested: true },
      },
    });

    await prisma.$transaction(async (tx) => {
      // [MIGRATION-FLAG: Stage 3 Switch] 1. Persist to modular PaymentAccount (lazy creation)
      await tx.paymentAccount.upsert({
        where: { userId },
        create: {
          userId,
          stripeAccountId: account.id,
        },
        update: {
          stripeAccountId: account.id,
        },
      });

      // [MIGRATION-FLAG: Stage 3 Switch] 2. Legacy dual-write
      await tx.user.update({
        where: { id: userId },
        data: { stripeAccountId: account.id },
      });
    });

    await userCache.invalidateAll();

    return account.id;
  }

  static async createOnboardingLink(userId: string): Promise<{ url: string }> {
    const accountId = await this.createExpressAccount(userId);

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: STRIPE_CONNECT_REFRESH_URL,
      return_url: STRIPE_CONNECT_RETURN_URL,
      type: "account_onboarding",
    });

    return { url: accountLink.url };
  }

  static async getOnboardingStatus(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { paymentAccount: true },
    });
    if (!user) throw new Error("User not found");

    const paymentAccount = user.paymentAccount;
    const stripeAccountId = paymentAccount?.stripeAccountId ?? user.stripeAccountId;
    const stripeOnboardingComplete =
      paymentAccount?.stripeOnboardingComplete ?? user.stripeOnboardingComplete;
    const stripeChargesEnabled =
      paymentAccount?.stripeChargesEnabled ?? user.stripeChargesEnabled;
    const stripePayoutsEnabled =
      paymentAccount?.stripePayoutsEnabled ?? user.stripePayoutsEnabled;

    return {
      hasStripeAccount: !!stripeAccountId,
      stripeOnboardingComplete,
      stripeChargesEnabled,
      stripePayoutsEnabled,
    };
  }

  /** Webhook-driven: keeps PaymentAccount and User flags in sync with the connected account's real state. */
  static async handleAccountUpdated(account: Stripe.Account): Promise<void> {
    // Look up by PaymentAccount first, or legacy User
    let userId: string | null = null;

    const paymentAcc = await prisma.paymentAccount.findUnique({
      where: { stripeAccountId: account.id },
      select: { userId: true },
    });

    if (paymentAcc) {
      userId = paymentAcc.userId;
    } else {
      const legacyUser = await prisma.user.findUnique({
        where: { stripeAccountId: account.id },
        select: { id: true },
      });
      userId = legacyUser?.id ?? null;
    }

    if (!userId) return; // not one of our connected accounts

    await prisma.$transaction(async (tx) => {
      // [MIGRATION-FLAG: Stage 3 Switch] 1. Update PaymentAccount
      await tx.paymentAccount.upsert({
        where: { userId: userId! },
        create: {
          userId: userId!,
          stripeAccountId: account.id,
          stripeChargesEnabled: !!account.charges_enabled,
          stripePayoutsEnabled: !!account.payouts_enabled,
          stripeOnboardingComplete: !!account.details_submitted,
        },
        update: {
          stripeChargesEnabled: !!account.charges_enabled,
          stripePayoutsEnabled: !!account.payouts_enabled,
          stripeOnboardingComplete: !!account.details_submitted,
        },
      });

      // [MIGRATION-FLAG: Stage 3 Switch] 2. Legacy dual-write
      await tx.user.update({
        where: { id: userId! },
        data: {
          stripeChargesEnabled: !!account.charges_enabled,
          stripePayoutsEnabled: !!account.payouts_enabled,
          stripeOnboardingComplete: !!account.details_submitted,
        },
      });
    });

    await userCache.invalidateAll();
  }
}
