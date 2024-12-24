import { Request, Response } from "express";
import { ObjectId } from "mongodb";

import UserSvc from "../services/user.service";
import VenueSubscriptionSvc from "../services/venue-subscription.service";
import { convertCentsToDollars } from "../utils/helpers";
import { handleErrorResponse, handleResponse } from "../utils/reponse";
import { cancelSubscription, handleStripeUpdateSubscription } from "../utils/stripe";
import { validateCreateSubscription, validateUpdateVenueSubscription } from "../utils/subscription/validation";

export default class SubscriptionCtrl {
  static async createSubscription(req: Request, res: Response) {
    const payload = req.body;
    const { error } = validateCreateSubscription(payload);
    if (error) {
      return res.status(400).json({ message: error.message });
    }

    const user_id = new ObjectId(req?.user._id);
    const result = await VenueSubscriptionSvc.processCreateVenueSubscription(payload, user_id);

    if (result.code) {
      res.status(result.code).json({ message: result.message });
    } else {
      return res.json(result);
    }
  }

  static async updateVenueSubscription(req: Request, res: Response) {
    const { space_number } = req.body;
    const subscriptionId = new ObjectId(req.params.id);

    if (!ObjectId.isValid(subscriptionId)) {
      return res.status(400).json({ message: "Invalid subscription ID" });
    }

    const { error } = validateUpdateVenueSubscription(req.body);
    if (error) {
      return res.status(400).json({ message: error.message });
    }

    try {
      const user_id = new ObjectId(req?.user._id);
      const userData = await UserSvc.getUser({ _id: user_id });
      if (!userData) return handleErrorResponse(res, {}, { code: "USER_NOT_FOUND" });

      const [subscriptionData] = await VenueSubscriptionSvc.getVenueSubscription({ _id: subscriptionId });
      if (!subscriptionData) return handleErrorResponse(res, {}, { code: "SUBSCRIPTION_NOT_FOUND" });
      const stripeSubscription: any = await handleStripeUpdateSubscription(subscriptionData.subscription_id, space_number);
      if (!stripeSubscription) {
        return handleErrorResponse(res, {}, { code: "STRIPE_SUBSCRIPTION_ERROR", message: "Failed to update Stripe subscription" });
      }

      const fee = convertCentsToDollars(stripeSubscription.price.unit_amount * stripeSubscription.quantity);
      const updateResult = await VenueSubscriptionSvc.updateVenueSubscription({ _id: subscriptionId }, { space_number, fee });

      if (updateResult.matchedCount === 0) {
        return handleErrorResponse(res, {}, { code: "UPDATE_FAILED", message: "Failed to update venue subscription" });
      }

      return handleResponse(res, {}, "SUBSCRIPTION_UPDATED_SUCCESSFULL");
    } catch (err) {
      return handleErrorResponse(res, err, { code: "SUBSCRIPTION_UPDATE_ERROR", message: "An error occurred while updating the subscription" });
    }
  }

  static async deleteVenueSubscription(req: Request, res: Response) {
    const subscriptionId = new ObjectId(req.params.id);

    if (!ObjectId.isValid(subscriptionId)) {
      return res.status(400).json({ message: "Invalid subscription ID" });
    }

    const [subscriptionData] = await VenueSubscriptionSvc.getVenueSubscription({ _id: subscriptionId });
    if (!subscriptionData) return handleErrorResponse(res, {}, { code: "SUBSCRIPTION_NOT_FOUND" });

    const cancelResult = await cancelSubscription(subscriptionData.subscription_id);
    if (cancelResult) {
      const updateResult = await VenueSubscriptionSvc.updateVenueSubscription({ _id: subscriptionId }, { status: "cancelled" });
      if (updateResult.matchedCount === 0) {
        return handleErrorResponse(res, {}, { code: "DELETE_FAILED", message: "Failed to delete venue subscription" });
      }
    }

    return handleResponse(res, {}, "SUBSCRIPTION_DELETED_SUCCESSFULLY");
  }

  static async getVenueSubscription(req: Request, res: Response) {
    try {
      const { venueId, status, endDate, subscriptionId, _id } = req.query as any;

      const userId = new ObjectId(req?.user._id);

      const query: any = {
        ...(_id && { _id: new ObjectId(_id) }),
        ...(venueId && { venue: new ObjectId(venueId) }),
        status: { $ne: "requires_payment_method" },
        ...(status && {
          status: {
            $in: status
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean),
            $ne: "requires_payment_method",
          },
        }),
        ...(endDate && { endDate: new Date(endDate) }),
        ...(subscriptionId && { subscription_id: new ObjectId(subscriptionId) }),
        user: new ObjectId(userId),
      };

      const [result] = await VenueSubscriptionSvc.getVenueSubscription(query);
      return handleResponse(res, result, "FETCHED_VENUE_SUBSCRIPTION_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "FAILED_TO_FETCH_VENUE_SUBSCRIPTION" });
    }
  }
}
