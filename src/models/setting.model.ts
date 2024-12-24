import { ObjectId } from "mongodb";

export type TSetting = {
  _id?: ObjectId;
  sales_commission_rate?: number;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: ObjectId;
};

export type TUpdateSetting = {
  sales_commission_rate?: number;
  updatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: ObjectId;
};

export class MSetting implements Partial<TSetting> {
  _id?: ObjectId;
  sales_commission_rate?: number;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: ObjectId;

  constructor({ _id = new ObjectId(), sales_commission_rate, createdAt = new Date(), updatedAt, deletedAt, deletedBy } = {} as TSetting) {
    this._id = _id;
    this.sales_commission_rate = sales_commission_rate;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.deletedAt = deletedAt;
    this.deletedBy = deletedBy;
  }
}
