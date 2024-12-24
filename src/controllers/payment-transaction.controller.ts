import { Request, Response } from "express";
import { ObjectId } from "mongodb";

import { account_transcation_status } from "../models/stripe-account-transaction.model";
import StripeAccountTransactionSvc from "../services/stripe-account-transaction.service";
import { convertDollarsToCents } from "../utils/helpers";
import { handleErrorResponse, handleResponse } from "../utils/reponse";
import { createTransfer } from "../utils/stripe";

export default class PaymentTransactionCtrl {
  static async getTransactions(req: Request, res: Response) {
    const results = await StripeAccountTransactionSvc.getAccount({});
    return handleResponse(res, results, "FETCH_ACCOUNT_TRANSACTION");
  }

  static async repeatTransfer(req: Request, res: Response) {
    try {
      const [accountStripeTransaction]: any = await StripeAccountTransactionSvc.getAccount({
        _id: new ObjectId(req.params.id),
      });
      if (!accountStripeTransaction) {
        return handleErrorResponse(
          res,
          { message: "No Stripe account transaction found" },
          {
            code: "ERROR_BOOKING_FAILED",
          },
        );
      }

      let transfer_status = account_transcation_status.COMPLETED;
      let recurring = false;
      const stripe_account = accountStripeTransaction.stripe_account.stripe_account_id;
      const amount = convertDollarsToCents(accountStripeTransaction.amount);
      const currency = "usd";
      const transferFunds: { error: Boolean; message: string } = await createTransfer(stripe_account, amount, currency);
      if (transferFunds.error) {
        transfer_status = account_transcation_status.FAILED;
        recurring = true;
      }
      await StripeAccountTransactionSvc.updateAccount(
        {
          _id: accountStripeTransaction._id,
        },
        { status: transfer_status, updatedAt: new Date(), message: transferFunds.message, recurring },
      );
      return handleResponse(res, {}, "TRANSFER_SUCCESS");
    } catch (error) {
      return handleErrorResponse(res, error, {
        code: "ERROR_IN_FUND_TRANSFER",
      });
    }
  }
}
