/* eslint-disable no-useless-catch */
/* eslint-disable no-case-declarations */
/* eslint-disable indent */
import Stripe from "stripe";

import {
  GOGOJI_URI,
  SITEURL,
  STRIPE_SECRET_KEY,
  STRIPE_WEBOOK_SECRET_ACCOUNT,
  STRIPE_WEBOOK_SECRET_ACCOUNT_CONNECTED
} from "../config";
import { logger } from "./logger";

const stripe = new Stripe(STRIPE_SECRET_KEY);

export interface CreateProductionPayload {
  name: string;
  description?: string; // Mark as optional
  currency: string;
  recurring?: any;
  price: number;
}

export const handlePayment = async ({ amount, currency = "SGD", customer }: { amount: number; currency: string; customer?: string }) => {
  // eslint-disable-next-line no-useless-catch
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      ...(customer && { customer }),
      amount,
      currency,
      // setup_future_usage: "off_session",
      automatic_payment_methods: {
        enabled: true,
      },
    });
    return paymentIntent;
  } catch (error) {
    throw error;
  }
};

export const setupPaymentRequest = async () => {
  const paymentIntent = await stripe.setupIntents.create({
    automatic_payment_methods: {
      enabled: true,
    },
  });
  return paymentIntent;
};

export const createCustomer = async ({ name, email }: any) => {
  const customer = await stripe.customers.create({
    name,
    email,
  });
  return customer;
};

export const updateCustomer = async ({ payment_method_id, customer_id }: { payment_method_id: string; customer_id: string }) => {
  // eslint-disable-next-line no-useless-catch
  try {
    const paymentMethod = await stripe.paymentMethods.attach(payment_method_id, {
      customer: customer_id,
    });
    return paymentMethod;
  } catch (err) {
    throw err;
  }
};

export const createAccount = async ({ country, email, tenant }: { country: string; email: string; tenant?: any }) => {
  const account = await stripe.accounts.create({
    type: "express",
    country,
    email,
    business_type: "individual",
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    individual: {
      email: email,
    },
  });

  const accountLink = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: tenant?.config?.site_url,
    return_url: tenant?.config?.site_url,
    type: "account_onboarding",
  });

  return { accountLink, account_id: account.id };
};

export const subscriptionList = async (customerId) => {
  const subscriptions = await stripe.subscriptions.list({ customer: customerId });
  return subscriptions;
};

export const handleEvents = async ({ payload }: any, identifier) => {
  const payloadString = JSON.stringify(payload, null, 2);
  const TOKEN = identifier === "CONNECT_ACCOUNTS" ? STRIPE_WEBOOK_SECRET_ACCOUNT_CONNECTED : STRIPE_WEBOOK_SECRET_ACCOUNT;
  console.log({ token: TOKEN });
  const header = stripe.webhooks.generateTestHeaderString({
    payload: payloadString,
    secret: TOKEN,
  });

  try {
    return stripe.webhooks.constructEvent(payloadString, header, TOKEN);
  } catch (err) {
    console.log({ err });
    throw err;
  }
};

export const retriveAccount = async (account_id: string, tenant: any) => {
  const stripeAccount = await stripe.accounts.retrieve(account_id);
  if (stripeAccount) {
    // Create a new account link for the existing account
    return await stripe.accountLinks.create({
      account: stripeAccount.id,
      refresh_url: tenant?.config?.site_url,
      return_url: tenant?.config?.site_url,
      type: "account_onboarding",
    });
  }
};

export const deleteAccount = async (account_id: string) => {
  const deleted = await stripe.accounts.del(account_id);
  return deleted;
};

export const refundAccount = async (paymentId: string, amount: number) => {
  try {
    const refund = await stripe.refunds.create({
      charge: paymentId,
      amount,
    });
    return refund;
  } catch (error) {
    return error;
  }
};

export const getPaymentAccount = async (paymentId: string) => {
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentId);
  return paymentIntent;
};

export const createTransfer = async (accountId: string, amount: number, currency = "sgd") => {
  try {
    logger.log({
      level: "info",
      message: `PAYLOAD_TRANSFER_FUND: ${JSON.stringify({ amount, currency, destination: accountId })}`,
    });
    const transfer = await stripe.transfers.create({
      amount,
      currency,
      destination: accountId,
    });
    return {
      error: false,
      message: "success",
      data: transfer,
    };
  } catch (error: any) {
    logger.log({
      level: "info",
      message: `ERROR_TRANSFER_FUND: ${JSON.stringify({ error: true, message: error?.message, data: null })}`,
    });
    return { error: true, message: error?.message, data: null };
  }
};

export const createLoginLink = async (accountId: string) => {
  const loginLink = await stripe.accounts.createLoginLink(accountId);
  return loginLink;
};

export const createProduction = async (payload: CreateProductionPayload) => {
  try {
    const product = await stripe.products.create({
      name: payload.name,
      description: payload.description,
    });

    return { product };
  } catch (error) {
    console.log(error);
  }
};

export const handleStripeCreateSubscription = async ({
  customerId,
  priceId,
  quantity,
}: {
  customerId: string;
  priceId: string;
  quantity: number;
}) => {
  try {
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [
        {
          price: priceId,
          quantity,
        },
      ],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
    });
    return subscription;
  } catch (error) {
    return {
      error: true,
      message: error.message,
    };
  }
};

export const createPrice = async ({ unit_amount, product_id, currency }: { unit_amount: number; product_id: any; currency: string }) => {
  return stripe.prices.create({
    unit_amount,
    currency: currency,
    recurring: { interval: "month" },
    product: product_id,
  });
};

export const retrieveSubscription = async (subscriptionId: string) => {
  return stripe.subscriptions.retrieve(subscriptionId);
};

export const cancelSubscription = async (subscriptionId: string) => {
  return stripe.subscriptions.cancel(subscriptionId);
};

export const handleStripeUpdateSubscription = async (subscriptionId: string, quantity: number) => {
  const subscription = await retrieveSubscription(subscriptionId);
  const updatedSubscription = await stripe.subscriptionItems.update(subscription.items.data[0].id, {
    quantity,
  });
  return updatedSubscription;
};

export const handleSubsciption = async (data: any) => {
  const paymentMethod: any = data.object;
  const customerId: any = paymentMethod.customer; // Customer ID from the event
  const paymentMethodId: any = paymentMethod.id; // Payment method ID
  const subscriptionIds = [];
  const subscriptions = await subscriptionList(customerId);
  for (const subscription of subscriptions.data) {
    if (subscription.default_payment_method === paymentMethodId) {
      subscriptionIds.push(subscription.id);
    }
  }
  return subscriptionIds;
};

export const getAccount = (accountId) => {
  return stripe.accounts.retrieve(accountId);
};

export const retrieveCustomer = async (customerId) => {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    return customer;
  } catch (err) {
    return false;
  }
};
