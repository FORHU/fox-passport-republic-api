import { TStripeCustomer } from "../models/stripe-customer.model";
import StripeCustomerRepo from "../repositories/stripe-customer.repository";

export default class StripeCustomerSvc {
  static getCustomer(query: any) {
    return StripeCustomerRepo.getCustomer(query);
  }

  static createCustomer(data: TStripeCustomer) {
    return StripeCustomerRepo.createCustomer(data);
  }

  static createOrUpdateCustomer(query: any, data: any) {
    return StripeCustomerRepo.createOrUpdateCustomer(query, data);
  }
}
