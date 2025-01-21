/* eslint-disable no-unused-vars */
import { ObjectId } from "mongodb";

import { PaymentMethod } from "./venue-subscription.model";

export enum country_select {
  PH = "PH",
  SG = "SG",
  MY = "MY",
  AU = "AU",
  US = "US",
  GB = "GB",
  IE = "IE",
  CA = "CA",
}

export enum venue_representation {
  APARTMENT_PENTHOUSE = "APARTMENT_PENTHOUSE",
  AUDITORIUM = "AUDITORIUM",
  ACADEMIC_VENUE_UNIVERSITY_BUILDING = "ACADEMIC_VENUE_UNIVERSITY_BUILDING",
  PUB_BAR = "PUB_BAR",
  NIGHTCLUB = "NIGHTCLUB",
}

export enum venue_status {
  ALL = "ALL",
  OWNER_DECLINED = "OWNER_DECLINED",
  DELETED = "DELETED",
  DRAFT = "DRAFT",
  FOR_APPROVAL = "FOR_APPROVAL",
  FOR_DELETION = "FOR_DELETION",
  INPROGRESS = "INPROGRESS",
  OWNER_REQUEST_DELETION = "OWNER_REQUEST_DELETION",
  PENDING = "PENDING",
  PUBLISHED = "PUBLISHED",
  REJECTED = "REJECTED",
  REQUIRES_CONSENT = "REQUIRES_CONSENT",
  SPACE_FOR_DELETION = "SPACE_FOR_DELETION",
  SUSPENDED = "SUSPENDED",
  REQUEST_TRANSFER_SENT = "REQUEST_TRANSFER_SENT",
}

interface AgeRestriction {
  answer?: Boolean;
  min_age_requirement?: Number | null;
  enforcement_time?: string;
}

export type TVenue = {
  _id?: ObjectId;
  user?: ObjectId;
  name?: string;
  name_lower_case?: string;
  keywords?: ObjectId[];
  description?: string;
  representation?: venue_representation;
  address?: {
    street: string;
    street_2?: string;
    city: string;
    state?: string;
    country: country_select;
    postal_code: string;
    coordinates: {
      latitude: number;
      longitude: number;
    };
  };
  foods_and_beverages?: ObjectId[];
  venue_details?: ObjectId[];
  cancellation_policy?: ObjectId;
  status?: venue_status;
  form_steps?: number; // Make form_steps optional
  organization?: ObjectId;
  age_restriction?: AgeRestriction;
  commission?: number;
  rebate?: number;
  payment_method?: PaymentMethod;
  is_extracted?: boolean;
  tenant?: string;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: ObjectId;
  updatedBy?: ObjectId;
};

// Class definition for MVenue
export class MVenue implements Partial<TVenue> {
  _id?: ObjectId;
  user?: ObjectId;
  name?: string;
  name_lower_case?: string;
  representation?: venue_representation;
  description?: string;
  address?: {
    street: string;
    street_2?: string;
    city: string;
    state?: string;
    country: country_select;
    postal_code: string;
    coordinates: {
      latitude: number;
      longitude: number;
    };
  };
  keywords?: ObjectId[];
  form_steps?: number; // Default value for form_steps
  foods_and_beverages?: ObjectId[];
  venue_details?: ObjectId[];
  cancellation_policy?: ObjectId;
  status?: venue_status;
  organization?: ObjectId;
  age_restriction?: AgeRestriction;
  commission?: number;
  rebate?: number;
  payment_method?: PaymentMethod;
  is_extracted?: boolean;
  tenant?: string;
  createdAt: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: ObjectId;
  updatedBy?: ObjectId;

  constructor(
    {
      _id = new ObjectId(),
      user,
      name,
      name_lower_case,
      representation,
      description,
      address,
      keywords = [],
      cancellation_policy,
      status = venue_status.DRAFT,
      form_steps = 1,
      foods_and_beverages = [],
      organization,
      age_restriction,
      commission,
      rebate,
      payment_method,
      createdAt = new Date(),
      is_extracted = false,
      tenant,
      updatedAt,
      deletedAt,
      deletedBy,
      updatedBy,
    }: TVenue = {} as TVenue,
  ) {
    this._id = _id;
    this.user = user;
    this.name = name;
    this.name_lower_case = name_lower_case;
    this.representation = representation;
    this.description = description;
    this.address = address;
    this.keywords = keywords;
    this.cancellation_policy = cancellation_policy;
    this.status = status;
    this.foods_and_beverages = foods_and_beverages;
    this.form_steps = form_steps;
    this.organization = organization;
    this.age_restriction = age_restriction;
    this.commission = commission;
    this.rebate = rebate;
    this.payment_method = payment_method;
    this.is_extracted = is_extracted;
    this.tenant = tenant;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.deletedAt = deletedAt;
    this.deletedBy = deletedBy;
    this.updatedBy = updatedBy;
  }
}
