import { TUserRoles } from "../models/user-roles.model";
import UserRoleRepo from "../repositories/user-roles.repository";

export default class UserRolesSvc {
  static getUserRoles(query: TUserRoles) {
    return UserRoleRepo.getUserRoles(query);
  }

  static async createUserRoles(data: TUserRoles) {
    const results = await UserRoleRepo.createUserRoles(data);
    return results;
  }
}
