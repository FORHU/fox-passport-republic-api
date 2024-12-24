import { MOrganization, TOrganization } from "../models/organization.model";
import { getDB } from "../utils/mongo";

export default class OrganizationRepo {
  static collection() {
    return getDB().collection("organizations");
  }

  static async createOrganization(organization: TOrganization) {
    return this.collection().insertOne(new MOrganization(organization));
  }
}
