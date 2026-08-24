import {
  SystemRole,
  RoleType,
  VenueStatus,
  EventStatus,
  BookingStatus,
  PaymentStatus,
} from "@prisma/client";

export interface JWTUser {
  id: string;
  email: string;
  systemRole: SystemRole;
  roleType: RoleType[];
}

export {
  SystemRole,
  RoleType,
  VenueStatus,
  EventStatus,
  BookingStatus,
  PaymentStatus,
};
