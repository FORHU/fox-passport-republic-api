import { ObjectId } from "mongodb";

export enum AuthStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  PENDING = "PENDING",
  SUSPENDED = "SUSPENDED",
}

export type TAuth = {
  _id?: ObjectId;
  user?: ObjectId;
  accessToken?: string;
  refreshToken?: string;
  status?: AuthStatus;
  device_id?: string;
  device?: string;
  operating_system?: string;
  browser?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export type TUpdateAuth = {
  accessToken?: string;
  refreshToken?: string;
  status?: AuthStatus;
  device_id?: string;
  device?: string;
  operating_system?: string;
  browser?: string;
  updatedAt?: Date;
};

export class MAuth implements Partial<TAuth> {
  _id?: ObjectId;
  user?: ObjectId;
  accessToken?: string;
  refreshToken?: string;
  status?: AuthStatus;
  device_id?: string;
  device?: string;
  operating_system?: string;
  browser?: string;
  createdAt?: Date;
  updatedAt?: Date;

  constructor(
    {
      _id = new ObjectId(),
      user,
      accessToken = "",
      refreshToken = "",
      status = AuthStatus.ACTIVE,
      device_id,
      device,
      operating_system,
      browser,
      createdAt = new Date(),
      updatedAt,
    } = {} as TAuth,
  ) {
    this._id = _id;
    this.user = user;
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.device_id = device_id;
    this.device = device;
    this.operating_system = operating_system;
    this.browser = browser;
    this.status = status;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  setStatus(status: AuthStatus) {
    this.status = status;
  }
}
