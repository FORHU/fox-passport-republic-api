import { TStripeAccount } from "../models/stripe-account.model";
import StripeAccountRepo from "../repositories/stripe-account.repository";

export default class StripeAccountSvc {
  static getAccount(query: any) {
    return StripeAccountRepo.getAccount(query);
  }

  static getAccounts(query: any) {
    return StripeAccountRepo.getAccounts(query);
  }

  static createAccount(data: TStripeAccount) {
    return StripeAccountRepo.createAccount(data);
  }

  static updateAccount(query: any, data: any) {
    return StripeAccountRepo.updateAccount(query, data);
  }

  static deleteAccount(query: any) {
    return StripeAccountRepo.deleteAccount(query);
  }
}
