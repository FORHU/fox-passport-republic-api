import { ObjectId } from "mongodb";
export interface PaginationType {
  query?: any;
  skip?: number;
  limit?: number;
  user_id?: ObjectId;
  mark_as_favorite?: boolean;
  startDate?: Date;
  endDate?: Date;
}

export interface RequestWithParamsAndUser {
  params?: any;
  user?: any;
}

export interface TransferOwnershipPayload {
  email: string;
  role: string;
  country: string;
  status: string;
  venue_id?: ObjectId;
  venue_name?: string;
  current_user?: ObjectId;
}

export type LookupCollections =
  | "keywords"
  | "cancellationPolicies"
  | "foodsAndBeverages"
  | "venueDetails"
  | "spaces"
  | "venuePhotos"
  | "spacePhotos"
  | "users"
  | "profile_picture"
  | "organization_members"
  | "admin_member_role"
  | "stripe_account"
  | "user_roles";

export interface LookupFields {
  collection_name: string;
  field_name: LookupCollections;
  unwind: boolean;
  add_fields?: any;
}
