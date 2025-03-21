/* eslint-disable no-case-declarations */
/* eslint-disable indent */
import { Request, Response } from "express";
import { ObjectId } from "mongodb";

import { IS_ENQUIRY_MICROSERVICES } from "../config";
import { account_status } from "../models/stripe-account.model";
import EnquirySvc from "../services/enquiries.service";
import PaymentSvc from "../services/payment.service";
import PricingSvc from "../services/pricing.service";
import SpaceSvc from "../services/space.service";
import StripeAccountSvc from "../services/stripe-account.service";
import StripeCustomerSvc from "../services/stripe-customer.service";
import UserSvc from "../services/user.service";
import { logger } from "../utils/logger";
import { validateComputePaymentSchema, validateCreatePaymentSchema } from "../utils/payment/validation";
import { handleErrorResponse, handleResponse } from "../utils/reponse";
import { createCustomer, createLoginLink, handleEvents, retrieveCustomer, setupPaymentRequest } from "../utils/stripe";

export default class PaymentCtrl {
  static async processPayment(req: Request, res: Response) {
    const { enquiry_id } = req.body;

    const { error } = validateCreatePaymentSchema({
      enquiry_id,
    });

    if (error) {
      return handleErrorResponse(res, error, { code: "VALIDATION_ERROR_MISSING_FIELDS" });
    }

    let enquiry = null;
    if (IS_ENQUIRY_MICROSERVICES) {
      const { enquiries } = await EnquirySvc.getEnquiriesFromMicroservice({ enquiry_id });
      [enquiry] = enquiries;
    } else {
      [enquiry] = await EnquirySvc.getEnquiries({ _id: new ObjectId(enquiry_id as string) }, 0, 1);
    }

    if (!enquiry) {
      return handleErrorResponse(res, {}, { code: "ENQUIRY_NOT_FOUND_FOR_CREATE_OFFER" });
    }
    try {
      const result = await PaymentSvc.processPayment(enquiry_id, req.user, enquiry, req?.tenant);

      return handleResponse(res, result, "PAYMENT_SUCCESSFULLY");
    } catch (error) {
      return res.status(500).json({ message: error });
    }
  }

  static async computePayment(req: Request, res: Response) {
    const { space_id } = req.body;

    const { error } = validateComputePaymentSchema(req.body);
    if (error) {
      return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
    }

    const space: any = await SpaceSvc.getSpace({ _id: new ObjectId(space_id) });

    const pricing = await PricingSvc.getPrice({ _id: new ObjectId(space.pricing) });
    if (!pricing) {
      return res.status(404).json({ error: "Pricing details not found for the space" });
    }

    const results = await PaymentSvc.computePayment(req.body, space, pricing);
    return handleResponse(res, { results }, "PAYMENT_COMPUTATION");
  }

  static async processPaymentStatus(req: Request, res: Response) {
    logger.log({
      level: "info",
      message: `[PAYMENT_STATUS]: PAYLOAD ${JSON.stringify(req.body)}`,
    });
    const userRole = req.user.role;
    try {
      const result = await PaymentSvc.processPaymentStatus(req.body, req?.tenant, userRole);
      return handleResponse(res, result, "PAYMENT_STATUS");
    } catch (error) {
      console.log(error);
      logger.log({
        level: "info",
        message: `[PAYMENT_STATUS]: ERROR ${error}`,
      });
      return res.status(500).json({ message: error });
    }
  }

  static async createAccount(req: Request, res: Response) {
    const { user_id } = req.body;

    const user = await UserSvc.getUser({ _id: new ObjectId(user_id as string) });
    if (!user) {
      return res.status(404).json({ error: "USER_NOT_FOUND" });
    }

    const userStripeAccount: any = await StripeAccountSvc.getAccount({ user: new ObjectId(user_id as string) });
    if (userStripeAccount && userStripeAccount.status === account_status.COMPLETED) {
      return handleResponse(res, {}, "ACCOUNT_EXISTS");
    }

    const tenant = req?.tenant;
    const results = await PaymentSvc.createAccount(req.body, userStripeAccount, user, tenant);

    return handleResponse(res, { results: results.accountLink }, "ACCOUNT_CREATED");
  }

  static async handleAccountConnectWebhooks(req: Request, res: Response) {
    const event: any = await handleEvents({ payload: req.body }, "CONNECT_ACCOUNTS");
    await PaymentSvc.handleWebhooks(event);
    return handleResponse(res, {}, "PAYMENT_WEBHOOK");
  }

  static async handleAccountWebhooks(req: Request, res: Response) {
    const event: any = await handleEvents({ payload: req.body }, "ACCOUNTS");
    await PaymentSvc.handleWebhooks(event);
    return handleResponse(res, {}, "PAYMENT_WEBHOOK");
  }

  static async setupPaymentIntent(req: Request, res: Response) {
    const user = new ObjectId(req?.user._id);
    const userData = await UserSvc.getUser({ _id: user });

    const existingCustomer: any = await StripeCustomerSvc.getCustomer({ user });
    const existingStripeCustomer: any = await retrieveCustomer(existingCustomer?.customer_id);

    if (!existingCustomer || !existingStripeCustomer) {
      const results: any = await createCustomer({
        name: `${userData?.first_name} ${userData?.last_name}`,
        email: userData.email,
      });

      await StripeCustomerSvc.createOrUpdateCustomer(
        {
          user,
        },
        { customer_id: results?.id },
      );
    }

    const setupIntent = await setupPaymentRequest();

    return res.json({ client_id: setupIntent?.client_secret });
  }

  static async getPaymentDetails(req: Request, res: Response) {
    const custom_offer_id = req.query.custom_offer_id as string;
    const query: any = {
      custom_offer: new ObjectId(custom_offer_id),
    };

    const results = await PaymentSvc.getPayment(query);
    return handleResponse(res, results, "PAYMENT_DETAILS");
  }

  static async createLoginLink(req: Request, res: Response) {
    const user = req.user;
    const account = await StripeAccountSvc.getAccount({ user: new ObjectId(user?._id) });
    const results = await createLoginLink(account?.stripe_account_id);
    return handleResponse(res, results, "CREATED_ACCOUNT_LINKS");
  }
}
