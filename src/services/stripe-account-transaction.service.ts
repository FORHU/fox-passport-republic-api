import { TStripeAccountTransaction } from "../models/stripe-account-transaction.model";
import StripeAccountTransactionRepo from "../repositories/stripe-account-transaction.repository";

export default class StripeAccountTransactionSvc {
  static getAccount(query: any) {
    return StripeAccountTransactionRepo.getAccount(query);
  }

  static getAccounts(query: any, offset: number, limit: number) {
    return StripeAccountTransactionRepo.getAccounts(query, offset, limit);
  }

  static createAccount(data: TStripeAccountTransaction) {
    return StripeAccountTransactionRepo.createPaymentTransaction(data);
  }

  static updateAccount(query: any, data: any) {
    return StripeAccountTransactionRepo.updatePaymentTransaction(query, data);
  }

  static updateManyPaymentTransaction(query: any, data: any) {
    return StripeAccountTransactionRepo.updateManyPaymentTransaction(query, data);
  }

  static countAccounts(query: any) {
    return StripeAccountTransactionRepo.countAccounts(query);
  }
}
