import { TStripeProduction } from "../models/stripe-product.model";
import StripeProductRepo from "../repositories/stripe-product.repository";

export default class StripeProductSvc {
  static getProducts(query: any) {
    return StripeProductRepo.getProducts(query);
  }

  static createProduct(data: TStripeProduction) {
    return StripeProductRepo.createProduct(data);
  }
}
