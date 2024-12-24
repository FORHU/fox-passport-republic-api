import { ObjectId } from "mongodb";

import { TVenueSubscription } from "../models/venue-subscription.model";
import VenueSubscriptionRepo from "../repositories/venue-subscription.repository";
import { convertCentsToDollars } from "../utils/helpers";
import { cancelSubscription, createCustomer, handleStripeCreateSubscription, retrieveCustomer } from "../utils/stripe";
import StripeCustomerSvc from "./stripe-customer.service";
import UserSvc from "./user.service";
import VenueSvc from "./venue.service";

export default class VenueSubscriptionSvc {
  static createVenueSubscription(data: TVenueSubscription) {
    return VenueSubscriptionRepo.createVenueSubscription(data);
  }

  static async processCreateVenueSubscription(payload: any, user_id: ObjectId) {
    const { price_id, venue_id, space_number } = payload;

    const userData = await UserSvc.getUser({ _id: user_id });
    if (!userData) return { code: 400, message: "User not found" };

    const [venue] = await VenueSvc.getVenue({ _id: new ObjectId(venue_id) });
    if (!venue) return { code: 400, message: "Venue not found" };

    //delete inactive venue subscription
    const inActiveVenueSubscriptions = await VenueSubscriptionSvc.getVenueSubscription({
      user: user_id,
      venue: venue._id,
      status: { $ne: "active" },
    });

    const inActiveVenueSubscriptionIds = inActiveVenueSubscriptions.map((subscription) => subscription._id);
    if (inActiveVenueSubscriptionIds.length > 0) {
      for (const subscription of inActiveVenueSubscriptions) {
        if (subscription.subscription_id) {
          await cancelSubscription(subscription.subscription_id); // Cancels the inactive subscription in Stripe
        }
      }
      await VenueSubscriptionSvc.deleteVenueSubscription({ _id: { $in: inActiveVenueSubscriptionIds } });
    }

    const [existingVenueSubsciption] = await VenueSubscriptionSvc.getVenueSubscription({ user: user_id, venue: venue._id, status: "active" });
    if (existingVenueSubsciption) return { code: 400, message: "You already have a subscription" };

    const existingCustomer: any = await StripeCustomerSvc.getCustomer({ user: user_id });
    const existingStripeCustomer: any = await retrieveCustomer(existingCustomer?.customer_id);

    if (!existingCustomer || !existingStripeCustomer) {
      const results: any = await createCustomer({
        name: `${userData?.first_name} ${userData?.last_name}`,
        email: userData.email,
      });

      await StripeCustomerSvc.createOrUpdateCustomer(
        {
          user: user_id,
        },
        { customer_id: results?.id },
      );
    }

    const customer: any = await StripeCustomerSvc.getCustomer({ user: user_id });

    const subscription: any = await handleStripeCreateSubscription({
      customerId: customer.customer_id,
      priceId: price_id,
      quantity: space_number,
    });

    if (subscription.error) {
      return { code: 400, message: subscription.message };
    }

    const data = {
      venue: venue._id,
      user: userData._id,
      status: subscription.latest_invoice.payment_intent.status,
      fee: convertCentsToDollars(subscription.latest_invoice.payment_intent.amount),
      space_number,
      endDate: new Date(subscription.current_period_end * 1000),
      subscription_id: subscription.id,
      client_secret: subscription.latest_invoice.payment_intent.client_secret,
    };
    await VenueSubscriptionRepo.createVenueSubscription(data);

    return { subscription_id: subscription.id, client_secret: subscription.latest_invoice.payment_intent.client_secret };
  }

  static async getVenueSubscription(query: any) {
    return await VenueSubscriptionRepo.getVenueSubscription(query);
  }

  static updateVenueSubscription(query: any, data: Partial<TVenueSubscription>) {
    return VenueSubscriptionRepo.updateVenueSubscription(query, data);
  }

  static deleteVenueSubscription(query: any) {
    return VenueSubscriptionRepo.deleteVenueSubscription(query);
  }

  static async getOneVenueSubscription(query: any) {
    return await VenueSubscriptionRepo.getOneVenueSubscription(query);
  }
}
