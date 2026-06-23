import Stripe from "stripe";
import { prisma } from "../utils/prisma";
import { STRIPE_SECRET_KEY, STRIPE_CONNECT_REFRESH_URL, STRIPE_CONNECT_RETURN_URL } from "../config";

const stripe = new Stripe(STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-08-27.basil",
});

/**
 * Stripe Connect Express onboarding for Mayor/Foxer/Host payout recipients.
 * See docs/adr/0002-stripe-connect-payouts.md.
 */
export default class StripeConnectSvc {
  static async createExpressAccount(userId: string): Promise<string> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    if (user.stripeAccountId) return user.stripeAccountId;

    const account = await stripe.accounts.create({
      type: "express",
      email: user.email,
      capabilities: {
        transfers: { requested: true },
      },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { stripeAccountId: account.id },
    });

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
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    return {
      hasStripeAccount: !!user.stripeAccountId,
      stripeOnboardingComplete: user.stripeOnboardingComplete,
      stripeChargesEnabled: user.stripeChargesEnabled,
      stripePayoutsEnabled: user.stripePayoutsEnabled,
    };
  }

  /** Webhook-driven: keeps User flags in sync with the connected account's real state. */
  static async handleAccountUpdated(account: Stripe.Account): Promise<void> {
    const user = await prisma.user.findUnique({ where: { stripeAccountId: account.id } });
    if (!user) return; // not one of our connected accounts (or already detached)

    await prisma.user.update({
      where: { id: user.id },
      data: {
        stripeChargesEnabled: !!account.charges_enabled,
        stripePayoutsEnabled: !!account.payouts_enabled,
        stripeOnboardingComplete: !!account.details_submitted,
      },
    });
  }
}
