import { ObjectId } from "mongodb";

/**
 *  Add specific actions that we want to save
 */
export enum actions_enums {
  "VIEW_SPACE" = "VIEW_SPACE",
  "CREATE_SPACE" = "CREATE_SPACE",
  "UPDATE_SPACE" = "UPDATE_SPACE",
  "VIEW_VENUE" = "VIEW_VENUE",
  "CREATE_VENUE" = "CREATE_VENUE",
  "UPDATE_VENUE" = "UPDATE_VENUE"
}

export type TUserLogs = {
  _id?: ObjectId;
  user: ObjectId;
  action: actions_enums;
  details: any;
  count: number;
  createdAt?: Date;
  updatedAt?: Date;
};

export type TUserLogsUpdate = {
  user: ObjectId;
  action: actions_enums;
  details: any;
  count: number;
  updatedAt?: Date;
};

export class MUserLogs implements Partial<TUserLogs> {
  _id?: ObjectId;
  user: ObjectId;
  action: actions_enums;
  details: any;
  count: number;
  createdAt?: Date;
  updatedAt?: Date;

  constructor({ _id = new ObjectId(), user, action, details, count = 1, createdAt = new Date(), updatedAt } = {} as TUserLogs) {
    this._id = _id;
    this.user = user;
    this.action = action;
    this.details = details;
    this.count = count;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}
