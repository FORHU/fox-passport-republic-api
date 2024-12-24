import { TOrganization } from "../models/organization.model";
import OrganizationRepo from "../repositories/organization.repository";

export default class OrganizationSvc {
  static createOrganization(data: TOrganization) {
    return OrganizationRepo.createOrganization(data);
  }
}
