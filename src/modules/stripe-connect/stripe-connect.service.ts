import Stripe from "stripe";
import { userCache } from "../../utils/cache-namespaces";
import { prisma } from "../../utils/prisma";
import {
  STRIPE_SECRET_KEY,
  STRIPE_CONNECT_ACCOUNT_COUNTRY,
  STRIPE_CONNECT_REFRESH_URL,
  STRIPE_CONNECT_RETURN_URL,
} from "../../config";

const stripe = new Stripe(STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-08-27.basil",
});

/**
 * Accounts v2 for Connect is generally available from this API version. Only
 * account creation sends it; every other call stays on the client's version.
 */
const ACCOUNTS_V2_API_VERSION = "2025-12-15.clover";

let platformCountry: Promise<string | null> | null = null;

/**
 * The country of new connected accounts: `STRIPE_CONNECT_ACCOUNT_COUNTRY`
 * when set, else the platform account's own country, which is what v1 gave
 * an account created without one. Self-serve Connect accounts must be in a
 * country Stripe supports (the Philippines isn't), and cross-border ones in
 * the platform's region, so the platform's country is the safe default.
 * Null when it can't be read: the account is then created without one.
 */
async function connectAccountCountry(): Promise<string | null> {
  if (STRIPE_CONNECT_ACCOUNT_COUNTRY) return STRIPE_CONNECT_ACCOUNT_COUNTRY;
  platformCountry ??= stripe.accounts
    .retrieve()
    .then((platform) => platform.country?.toLowerCase() || null)
    .catch((e: unknown) => {
      platformCountry = null; // ask again next time
      console.error(
        `Couldn't read the platform account's country: ${(e as Error).message ?? "unknown error"}`,
      );
      return null;
    });
  return platformCountry;
}

/**
 * Creates a payout recipient's connected account through Accounts v2
 * (`POST /v2/core/accounts`), returning its `acct_…` id (api#396). A Stripe
 * account that sets up Connect fresh refuses Accounts v1
 * (`stripe.accounts.create`), so nobody could onboard there.
 *
 * The equivalent of the v1 Express account with `transfers` it replaces: the
 * Express dashboard (which needs the platform to collect fees and carry
 * losses), and the recipient configuration, which receives transfers into
 * the Stripe balance and pays them out to the Foxer's bank. Everything after
 * creation is unchanged, because Stripe takes a v2 account's id on v1
 * endpoints (account links and sessions, `accounts.retrieve`, transfers) and
 * still sends v1 `account.updated` for it to the Connect webhook.
 *
 * stripe-node 18 has no typed v2 accounts resource, hence `rawRequest`. One
 * idempotency key per user, so two clicks at once create one account.
 */
async function createRecipientAccount(user: {
  id: string;
  email: string;
  name?: string | null;
}): Promise<string> {
  const country = await connectAccountCountry();
  const account = (await stripe.rawRequest(
    "POST",
    "/v2/core/accounts",
    {
      contact_email: user.email,
      ...(user.name ? { display_name: user.name } : {}),
      dashboard: "express",
      ...(country ? { identity: { country } } : {}),
      configuration: {
        recipient: {
          // Only transfers can be requested here: Stripe refuses
          // `stripe_balance.payouts` ("Unknown field") and adds it itself,
          // active once onboarding is done (checked on the sandbox).
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
      metadata: { userId: user.id },
    },
    {
      apiVersion: ACCOUNTS_V2_API_VERSION,
      idempotencyKey: `connect-account:${user.id}`,
    },
  )) as { id?: unknown };
  if (typeof account.id !== "string" || !account.id.startsWith("acct_")) {
    throw new Error("Stripe did not return a connected account id");
  }
  return account.id;
}

// ------------SERVICE METHODS-----------------------------
export async function createStripeConnectAccount(user: {
  id: string;
  email: string;
}) {
  const account = { id: await createRecipientAccount(user) };

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

    const account = { id: await createRecipientAccount(user) };

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

  /**
   * A session for Stripe's embedded Connect components (onboarding, balances,
   * payments, payouts) on the caller's own account, found or created from
   * their user record. The web used to name the account itself, from
   * localStorage, to an unauthenticated route: any visitor could open any
   * account's payouts, and after an account switch the next user opened the
   * previous one's.
   */
  static async createAccountSession(
    userId: string,
  ): Promise<{ clientSecret: string }> {
    const account = await this.createExpressAccount(userId);
    const session = await stripe.accountSessions.create({
      account,
      components: {
        account_onboarding: { enabled: true },
        payments: { enabled: true },
        balances: { enabled: true },
        payouts: { enabled: true },
      },
    });
    return { clientSecret: session.client_secret };
  }

  static async getOnboardingStatus(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { paymentAccount: true },
    });
    if (!user) throw new Error("User not found");

    const paymentAccount = user.paymentAccount;
    const stripeAccountId =
      paymentAccount?.stripeAccountId ?? user.stripeAccountId;
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

  /**
   * Webhook-driven: keeps PaymentAccount and User flags in sync with the
   * connected account's real state. Returns the account's user id, or null
   * when the account isn't one of ours, so the caller can retry that user's
   * payouts once payouts are enabled.
   */
  static async handleAccountUpdated(
    account: Stripe.Account,
  ): Promise<string | null> {
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

    if (!userId) return null; // not one of our connected accounts

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
    return userId;
  }
}
