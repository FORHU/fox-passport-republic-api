// eslint-disable-next-line import/named
import { TSpaceProjectPayload } from "../../types/space";

export const USER_LOOKUP = {
  $lookup: {
    from: "users",
    localField: "user",
    foreignField: "_id",
    as: "user",
  },
};

export const USER_UNWIND = {
  $unwind: "$user",
};

export const VENUE_LOOKUP = {
  $lookup: {
    from: "venues",
    localField: "venue",
    foreignField: "_id",
    as: "venue",
  },
};

export const VENUE_UNWIND = {
  $unwind: "$venue",
};

export const SPACE_PHOTO_LOOKUP = {
  $lookup: {
    from: "files",
    localField: "space_photo",
    foreignField: "_id",
    as: "space_photo",
  },
};

export const VENUE_PHOTO_LOOKUP = {
  $lookup: {
    from: "files",
    localField: "venue_photo",
    foreignField: "_id",
    as: "venue_photo",
  },
};

export const FLOOR_PLAN_LOOKUP = {
  $lookup: {
    from: "files",
    localField: "floor_plan",
    foreignField: "_id",
    as: "floor_plan",
  },
};

export const CAPACITY_LAYOUT_LOOKUP = {
  $lookup: {
    from: "questions",
    localField: "capacity_layout",
    foreignField: "_id",
    as: "capacity_layout",
  },
};

export const FEATURES_LOOKUP = {
  $lookup: {
    from: "features",
    localField: "features",
    foreignField: "_id",
    as: "features",
  },
};

export const KEYWORDS_LOOKUP = {
  $lookup: {
    from: "keywords",
    localField: "keywords",
    foreignField: "_id",
    as: "keywords",
  },
};

export const GET_SPACES_RATING = {
  $lookup: {
    from: "ratings",
    localField: "_id",
    foreignField: "space",
    as: "ratings",
  },
};

export const BOOKING_LOOKUP = {
  $lookup: {
    from: "bookings",
    localField: "_id",
    foreignField: "space",
    as: "bookings",
  },
};

export const createSpacesProject = ({
  _id,
  status,
  space_details_name,
  space_details_description,
  space_photo,
  venue,
  pricing,
  capacity_layout,
  marked_as_favorite,
  rating,
  total_views,
  keywords,
  bookings,
}: TSpaceProjectPayload) => [
  {
    $project: {
      ...(_id && { _id }),
      ...(status && { status }),
      ...(space_details_name && { name: space_details_name }),
      ...(space_details_description && { description: space_details_description }),
      ...(space_photo && { space_photo }),
      ...(venue && { venue }),
      ...(pricing && { pricing }),
      ...(capacity_layout && { capacity_layout }),
      ...(marked_as_favorite && { marked_as_favorite }),
      ...(rating && { rating }),
      ...(total_views && { total_views }),
      ...(keywords && { keywords }),
      ...(bookings && { bookings }),
    },
  },
];
