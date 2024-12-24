import { MUserRoles, TUserRoles } from "../models/user-roles.model";
import { getDB } from "../utils/mongo";

export default class UserRolesRepo {
  static collection() {
    return getDB().collection("user-roles");
  }

  static async getUserRoles(query: TUserRoles) {
    return this.collection().findOne(query);
  }

  static async createUserRoles(data: TUserRoles, migration?: boolean) {
    const userInstance = new MUserRoles(data);

    if (!migration) await userInstance.save();

    const result = await this.collection().insertOne(userInstance);
    return result;
  }
}
