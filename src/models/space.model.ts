import { ObjectId } from "mongodb";

export enum space_represent {
  "THE_WHOLE_VENUE" = "THE_WHOLE_VENUE",
  "SEMI_PRIVATE_AREA_WITHIN_THE_SPACE" = "SEMI_PRIVATE_AREA_WITHIN_THE_SPACE",
  "PRIVATE_OUTDOOR_SPACE" = "PRIVATE_OUTDOOR_SPACE",
  "PRIVATE_SPACE_WITHIN_THE_VENUE" = "PRIVATE_SPACE_WITHIN_THE_VENUE",
  "SHARED_SPACE" = "SHARED_SPACE",
  SEMI_PRIVATE_OUTDOOR_SPACE = "SEMI_PRIVATE_OUTDOOR_SPACE",
}

export enum unit_area {
  SQM = "SQM",
  SQFT = "SQFT",
}

export enum space_status {
  ALL = "ALL",
  DELETED = "DELETED",
  DRAFT = "DRAFT",
  FOR_APPROVAL = "FOR_APPROVAL",
  FOR_DELETION = "FOR_DELETION",
  FOR_TRANSACTION_CLOSING = "FOR_TRANSACTION_CLOSING",
  INPROGRESS = "INPROGRESS",
  OWNER_DECLINED = "OWNER_DECLINED",
  OWNER_REQUEST_DELETION = "OWNER_REQUEST_DELETION",
  PENDING = "PENDING",
  PUBLISHED = "PUBLISHED",
  REJECTED = "REJECTED",
  REQUIRES_CONSENT = "REQUIRES_CONSENT",
  SUSPENDED = "SUSPENDED",
}

export type TSpaceDelete = {
  spaceId: ObjectId;
  deletedBy: ObjectId;
};

export type TSpace = {
  _id?: ObjectId;
  venue?: ObjectId;
  user?: ObjectId;
  status?: space_status;
  name?: string;
  name_lower_case?: string;
  type?: string;
  representation?: space_represent;
  description?: string;
  space_photo?: ObjectId[];
  venue_photo?: ObjectId[];
  menu_photo?: ObjectId[];
  capacity_layout?: ObjectId[];
  guest_capacity?: {
    minimum?: number | null;
    maximum?: number | null;
    floorspace?: {
      value?: number | null;
      unit?: unit_area;
    };
  };
  floor_plan?: ObjectId[];
  features?: ObjectId[];
  keywords?: ObjectId[];
  pricing?: ObjectId;
  form_steps?: number;
  is_extracted?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: ObjectId;
};

export type TSpaceUpdateOptions = TSpace;

export class MSpace implements Partial<TSpace> {
  _id?: ObjectId;
  venue?: ObjectId;
  user?: ObjectId;
  status?: space_status;
  name?: string;
  name_lower_case?: string;
  type?: string;
  representation?: space_represent;
  description?: string;
  space_photo?: ObjectId[];
  venue_photo?: ObjectId[];
  menu_photo?: ObjectId[];
  capacity_layout?: ObjectId[];
  guest_capacity?: {
    minimum?: number | null;
    maximum?: number | null;
    floorspace?: {
      value?: number | null;
      unit?: unit_area;
    };
  };
  floor_plan?: ObjectId[];
  features?: ObjectId[];
  keywords?: ObjectId[];
  pricing?: ObjectId;
  form_steps?: number;
  is_extracted?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: ObjectId;
  constructor(
    {
      _id = new ObjectId(),
      venue,
      user,
      status = space_status.INPROGRESS,
      name,
      name_lower_case,
      type,
      representation,
      description,
      space_photo = [],
      venue_photo = [],
      menu_photo = [],
      capacity_layout,
      guest_capacity,
      floor_plan = [],
      features = [],
      keywords,
      pricing,
      form_steps = 1,
      is_extracted = false,
      createdAt = new Date(),
      updatedAt,
      deletedAt = undefined,
      deletedBy = undefined,
    } = {} as TSpace,
  ) {
    this._id = _id;
    this.venue = venue;
    this.user = user;
    this.status = status;
    this.name = name;
    this.name_lower_case = name_lower_case;
    this.type = type;
    this.representation = representation;
    this.description = description;
    this.space_photo = space_photo;
    this.venue_photo = venue_photo;
    this.menu_photo = menu_photo;
    this.capacity_layout = capacity_layout;
    this.guest_capacity = guest_capacity;
    this.floor_plan = floor_plan;
    this.features = features;
    this.keywords = keywords;
    this.pricing = pricing;
    this.form_steps = form_steps;
    this.is_extracted = is_extracted;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.deletedAt = deletedAt;
    this.deletedBy = deletedBy;
  }
}
