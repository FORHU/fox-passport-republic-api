export interface DevicePayload {
  device_id: string;
  device: string;
  operating_system: string;
  browser: string;
}

export interface Token {
  _id: string;
  admin: string;
  email: string;
  assigned_roles: string;
  createdAt: Date;
}
